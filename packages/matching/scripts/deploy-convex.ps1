param(
  [string]$ProgramId = 'HkboPxfwBemtYkwfkHzMknHdiM7YP32KkU6Rgjy4LGun',
  [string]$GenesisHash = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'
)
$ErrorActionPreference = 'Stop'
if (-not $env:SWAPCIRCLE_CONVEX_DEPLOY_KEY) { throw 'Run through psst SWAPCIRCLE_CONVEX_DEPLOY_KEY -- powershell -File packages/matching/scripts/deploy-convex.ps1' }
$env:CONVEX_DEPLOY_KEY = $env:SWAPCIRCLE_CONVEX_DEPLOY_KEY
pnpm exec convex env set SWAPCIRCLE_PROGRAM_ID $ProgramId
if ($LASTEXITCODE -ne 0) { throw 'Convex program context could not be configured' }
pnpm exec convex env set SWAPCIRCLE_GENESIS_HASH $GenesisHash
if ($LASTEXITCODE -ne 0) { throw 'Convex network context could not be configured' }
pnpm exec convex deploy --yes
if ($LASTEXITCODE -ne 0) { throw 'Convex deployment failed' }
