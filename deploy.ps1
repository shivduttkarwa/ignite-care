# Ships main to the Ignite server. .\deploy.ps1, or .\deploy.ps1 -Ref <commit> to go back to an earlier one.
param(
  [string]$Ref,
  [string]$Server = "ignite"
)

function Stop-Deploy([string]$Message) {
  Write-Host $Message -ForegroundColor Red
  exit 1
}

$repo = $PSScriptRoot

if (-not $Ref) {
  $branch = git -C $repo branch --show-current
  if ($branch -ne "main") { Stop-Deploy "Deploys go out from main; you're on '$branch'." }
  if (git -C $repo status --porcelain --untracked-files=no) {
    Stop-Deploy "You have uncommitted changes. Commit or stash them first; only committed work is deployed."
  }
  git -C $repo push origin main
  if ($LASTEXITCODE) { Stop-Deploy "git push failed, so nothing was deployed." }
  $Ref = git -C $repo rev-parse HEAD
}

Write-Host "Deploying $Ref to $Server" -ForegroundColor Cyan
ssh $Server "sudo bash /srv/ignite/app/deploy/deploy.sh $Ref"
if ($LASTEXITCODE) { Stop-Deploy "Deploy failed; see the output above." }
