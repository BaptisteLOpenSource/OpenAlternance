; Built by CI: iscc /DAppVersion=X.Y.Z installer/openalternance.iss
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
; Fixed GUID: changing it breaks upgrades. Doubled brace = literal "{".
AppId={{0332B991-D3C8-4B91-B5B0-2FEADE307490}
AppName=OpenAlternance
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\OpenAlternance
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
CloseApplications=yes
UninstallDisplayIcon={app}\OpenAlternance.exe
SetupIconFile=openalternance.ico
OutputDir=Output
OutputBaseFilename=OpenAlternance-Setup

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer une icône sur le Bureau"; Flags: unchecked

[Files]
Source: "..\dist-desktop\OpenAlternance.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\OpenAlternance"; Filename: "{app}\OpenAlternance.exe"
Name: "{autodesktop}\OpenAlternance"; Filename: "{app}\OpenAlternance.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\OpenAlternance.exe"; Description: "Lancer OpenAlternance"; Flags: nowait postinstall

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM OpenAlternance.exe /F"; Flags: runhidden; RunOnceId: "StopApp"

[Code]
const
  GuideUrl = 'https://openalternance.baptisteledev.fr/installation-en-ligne/#neon';

var
  ModePage: TInputOptionWizardPage;
  UrlPage: TInputQueryWizardPage;

function ConfigFile: String;
begin
  Result := ExpandConstant('{userappdata}\OpenAlternance\config.json');
end;

function ConfigText: AnsiString;
begin
  Result := '';
  if FileExists(ConfigFile) then LoadStringFromFile(ConfigFile, Result);
end;

// Only the Neon URL needs escaping; mode and fixed keys are plain ASCII.
function JsonEscape(Value: String): String;
begin
  Result := Value;
  StringChange(Result, '\', '\\');
  StringChange(Result, '"', '\"');
end;

// App writes indented JSON: "mode": "online" has a space.
function IsOnlineConfig: Boolean;
var
  Text: AnsiString;
begin
  Text := ConfigText;
  Result := (Pos('"mode":"online"', Text) > 0) or (Pos('"mode": "online"', Text) > 0);
end;

function HasProtectedUrl: Boolean;
begin
  Result := Pos('"databaseUrlProtected"', ConfigText) > 0;
end;

procedure GuideClick(Sender: TObject; const Link: String; LinkType: TSysLinkType);
var
  ResultCode: Integer;
begin
  ShellExec('open', GuideUrl, '', '', SW_SHOWNORMAL, ewNoWait, ResultCode);
end;

procedure InitializeWizard;
var
  GuideLink: TNewLinkLabel;
begin
  ModePage := CreateInputOptionPage(wpSelectDir,
    'Mode de stockage', 'Où garder vos données ?',
    'Ce choix se fait une fois ; tu peux réinstaller pour le changer.', True, False);
  ModePage.Add('Sur ce PC uniquement (aucun compte, rien en ligne)');
  ModePage.Add('En ligne avec Neon (plusieurs PC + mobile)');
  if IsOnlineConfig then ModePage.SelectedValueIndex := 1
  else ModePage.SelectedValueIndex := 0;

  UrlPage := CreateInputQueryPage(ModePage.ID,
    'Base en ligne Neon', 'Clé de connexion',
    'Colle la chaîne postgresql://... de ta branche Neon.');
  UrlPage.Add('Clé de connexion Neon (postgresql://...)', False);

  GuideLink := TNewLinkLabel.Create(WizardForm);
  GuideLink.Parent := UrlPage.Surface;
  GuideLink.Caption := '<a href="' + GuideUrl + '">Où trouver ma clé ? (guide)</a>';
  GuideLink.Top := UrlPage.Edits[0].Top + UrlPage.Edits[0].Height + ScaleY(12);
  GuideLink.OnLinkClick := @GuideClick;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := WizardSilent or ((PageID = UrlPage.ID) and ModePage.Values[0]);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Url: String;
begin
  Result := True;
  if CurPageID <> UrlPage.ID then Exit;
  Url := Trim(UrlPage.Values[0]);
  if (Url = '') and not HasProtectedUrl then
  begin
    MsgBox('Colle la clé Neon (postgresql://...) ou reviens choisir le mode local.', mbError, MB_OK);
    Result := False;
  end
  else if (Url <> '') and (Copy(Lowercase(Url), 1, 8) <> 'postgres') then
  begin
    MsgBox('La clé doit commencer par postgres (postgresql://...).', mbError, MB_OK);
    Result := False;
  end;
end;

// Empty URL on online mode = keep the existing protected config untouched.
procedure WriteConfig;
var
  Url, Json: String;
begin
  if ModePage.Values[0] then
    Json := '{"mode":"local"}'
  else
  begin
    Url := Trim(UrlPage.Values[0]);
    if Url = '' then Exit;
    Json := '{"mode":"online","databaseUrl":"' + JsonEscape(Url) + '"}';
  end;
  ForceDirectories(ExpandConstant('{userappdata}\OpenAlternance'));
  SaveStringToFile(ConfigFile, Json, False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  // Silent runs (update over existing install) never touch config.json.
  if (CurStep = ssPostInstall) and not WizardSilent then WriteConfig;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent then
    if MsgBox('Supprimer aussi vos données (base locale, sauvegardes, configuration) ? Les données en ligne sur Neon ne sont pas touchées.',
      mbConfirmation, MB_YESNO) = IDYES then
    begin
      DelTree(ExpandConstant('{localappdata}\OpenAlternance'), True, True, True);
      DelTree(ExpandConstant('{userappdata}\OpenAlternance'), True, True, True);
    end;
end;
