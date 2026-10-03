$ErrorActionPreference = 'Stop'
if (-not $env:CONVEX_ACCESS_TOKEN) { throw 'Run through psst CONVEX_ACCESS_TOKEN -- powershell -File packages/matching/scripts/provision-convex.ps1' }
$headers = @{ Authorization = "Bearer $env:CONVEX_ACCESS_TOKEN" }
$details = Invoke-RestMethod -Uri 'https://api.convex.dev/v1/token_details' -Headers $headers
if (-not $details.teamId) { throw 'Expected a Convex team token' }
$listing = Invoke-RestMethod -Uri "https://api.convex.dev/v1/teams/$($details.teamId)/projects?q=swapcircle&limit=100" -Headers $headers
$projects = if ($listing.projects) { $listing.projects } else { $listing }
$project = $projects | Where-Object { $_.slug -eq 'swapcircle' } | Select-Object -First 1
if (-not $project) {
  $project = Invoke-RestMethod -Method Post -Uri "https://api.convex.dev/v1/teams/$($details.teamId)/create_project" -Headers $headers -ContentType 'application/json' -Body '{"projectName":"swapcircle","deploymentType":"prod"}'
}
$deployments = Invoke-RestMethod -Uri "https://api.convex.dev/v1/projects/$($project.id)/list_deployments" -Headers $headers
$deployment = $deployments | Where-Object { $_.deploymentType -eq 'prod' } | Select-Object -First 1
if (-not $deployment) { throw 'New project did not return its production board deployment' }
$key = Invoke-RestMethod -Method Post -Uri "https://api.convex.dev/v1/deployments/$($deployment.name)/create_deploy_key" -Headers $headers -ContentType 'application/json' -Body '{"name":"swapcircle-development"}'
$key.deployKey | psst set SWAPCIRCLE_CONVEX_DEPLOY_KEY --stdin --tag hackyeah --tag swapcircle
if ($LASTEXITCODE -ne 0) { throw 'Could not store deploy key in psst' }
$key = $null
[PSCustomObject]@{ projectId = $project.id; slug = $project.slug; deploymentName = $deployment.name; url = $deployment.deploymentUrl; deployKeySecret = 'SWAPCIRCLE_CONVEX_DEPLOY_KEY' } | ConvertTo-Json
