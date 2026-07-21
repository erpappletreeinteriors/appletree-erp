param([int]$Port = 3334)
Set-Location $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "Appletree ERP offline test build running at http://localhost:$Port/"
Start-Process "http://localhost:$Port/appletree_erp_offline.html"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.LocalPath.TrimStart('/')
  if ([string]::IsNullOrEmpty($path)) { $path = "appletree_erp_offline.html" }
  $filePath = Join-Path (Get-Location) $path
  if (Test-Path $filePath -PathType Leaf) {
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $ext = [System.IO.Path]::GetExtension($filePath)
    $ctype = switch ($ext) { ".html" {"text/html"} ".js" {"application/javascript"} ".css" {"text/css"} ".png" {"image/png"} default {"application/octet-stream"} }
    $ctx.Response.ContentType = $ctype
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.OutputStream.Close()
}
