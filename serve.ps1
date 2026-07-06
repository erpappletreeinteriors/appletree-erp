param([int]$Port = 3333)
if ($env:PORT) { $Port = [int]$env:PORT }
Set-Location $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "LISTENING on http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = $ctx.Request.Url.LocalPath.TrimStart('/')

  if ($ctx.Request.HttpMethod -eq "POST" -and $path -eq "__save-icon") {
    # Dev-only helper: accepts {"filename":"icon-192.png","dataUrl":"data:image/png;base64,...."}
    # and writes the decoded PNG straight to disk. Used only to generate PWA
    # icons from the browser canvas since no local image tooling is installed.
    $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream)
    $body = $reader.ReadToEnd()
    $reader.Close()
    $json = $body | ConvertFrom-Json
    $b64 = $json.dataUrl -replace '^data:image/png;base64,',''
    $outBytes = [System.Convert]::FromBase64String($b64)
    $outPath = Join-Path (Get-Location) $json.filename
    [System.IO.File]::WriteAllBytes($outPath, $outBytes)
    $respBytes = [System.Text.Encoding]::UTF8.GetBytes("saved: $($json.filename) ($($outBytes.Length) bytes)")
    $ctx.Response.ContentType = "text/plain"
    $ctx.Response.ContentLength64 = $respBytes.Length
    $ctx.Response.OutputStream.Write($respBytes,0,$respBytes.Length)
    $ctx.Response.OutputStream.Close()
    continue
  }

  if ([string]::IsNullOrEmpty($path)) { $path = "appletree_erp_v2_1.html" }
  $filePath = Join-Path (Get-Location) $path
  if (Test-Path $filePath -PathType Leaf) {
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $ext = [System.IO.Path]::GetExtension($filePath)
    $ctype = switch ($ext) { ".html" {"text/html"} ".js" {"application/javascript"} ".css" {"text/css"} ".json" {"application/json"} ".png" {"image/png"} ".woff2" {"font/woff2"} default {"application/octet-stream"} }
    $ctx.Response.ContentType = $ctype
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.OutputStream.Close()
}
