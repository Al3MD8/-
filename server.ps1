$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
} catch {
    Write-Host "Port $port is in use. Trying 8080..." -ForegroundColor Yellow
    $port = 8080
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Start()
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "    Server Started Successfully!         " -ForegroundColor Green
Write-Host "    URL: http://localhost:$port          " -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server..." -ForegroundColor Gray

Start-Process "http://localhost:$port/index.html"

# Data file paths
$dataDir = Join-Path $PWD.Path "data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir -Force | Out-Null }
$usersFile = Join-Path $dataDir "users.json"
$commentsFile = Join-Path $dataDir "comments.json"
$uploadsDir = Join-Path $dataDir "uploads"
if (-not (Test-Path $uploadsDir)) { New-Item -ItemType Directory -Path $uploadsDir -Force | Out-Null }

if (-not (Test-Path $usersFile)) { "[]" | Out-File -FilePath $usersFile -Encoding UTF8 -Force }
if (-not (Test-Path $commentsFile)) { "{}" | Out-File -FilePath $commentsFile -Encoding UTF8 -Force }

function Read-JsonFile($path) {
    try { 
        $content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
        return ($content | ConvertFrom-Json) 
    } catch { return $null }
}
function Write-JsonFile($path, $data) {
    $jsonStr = $data | ConvertTo-Json -Depth 10 -Compress
    [System.IO.File]::WriteAllText($path, $jsonStr, [System.Text.Encoding]::UTF8)
}
function Send-JsonResponse($response, $data, $statusCode = 200) {
    $response.StatusCode = $statusCode
    $response.ContentType = "application/json; charset=utf-8"
    $response.Headers.Add("Access-Control-Allow-Origin", "*")
    $jsonStr = $data | ConvertTo-Json -Depth 10 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonStr)
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.Close()
}

function Get-RequestBody($request) {
    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    $reader.Close()
    return $body
}

# Outer robust loop that never stops
while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $requestUrl = $context.Request.Url.LocalPath
        $response = $context.Response
        $method = $context.Request.HttpMethod
        
        # CORS preflight
        if ($method -eq "OPTIONS") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
            $response.StatusCode = 204
            $response.Close()
            continue
        }
        
        if ($requestUrl -eq "/") { $requestUrl = "/index.html" }
        
        # ============ PROXY API ============
        if ($requestUrl -eq "/api/proxy") {
            $targetUrl = $context.Request.QueryString["url"]
            try {
                $headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
                $webRes = Invoke-WebRequest -Uri $targetUrl -UseBasicParsing -Headers $headers -TimeoutSec 10
                $content = $webRes.Content
                $response.ContentType = "text/html; charset=utf-8"
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.StatusCode = 200
                $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($content)
                $response.ContentLength64 = $contentBytes.Length
                $response.OutputStream.Write($contentBytes, 0, $contentBytes.Length)
            } catch {
                $response.StatusCode = 500
                $errorBytes = [System.Text.Encoding]::UTF8.GetBytes("Error")
                $response.ContentLength64 = $errorBytes.Length
                $response.OutputStream.Write($errorBytes, 0, $errorBytes.Length)
            }
            $response.Close()
            continue
        }
        
        # ============ AUTH API: Register ============
        if ($requestUrl -eq "/api/auth/register" -and $method -eq "POST") {
            $body = Get-RequestBody $context.Request
            $data = $body | ConvertFrom-Json
            $users = Read-JsonFile $usersFile
            if (-not $users) { $users = @() }
            if ($users.GetType().Name -ne "Object[]") { $users = @($users) }
            
            $existing = $users | Where-Object { $_.username -eq $data.username }
            if ($existing) {
                Send-JsonResponse $response @{ success = $false; error = "Username already exists" } 400
                continue
            }
            
            $newUser = @{
                id = [guid]::NewGuid().ToString().Substring(0,8)
                username = $data.username
                password = $data.password
                avatar = if ($data.avatar) { $data.avatar } else { "https://api.dicebear.com/7.x/bottts/svg?seed=$($data.username)" }
                createdAt = (Get-Date).ToString("o")
            }
            $users += $newUser
            Write-JsonFile $usersFile $users
            Send-JsonResponse $response @{ success = $true; user = @{ id = $newUser.id; username = $newUser.username; avatar = $newUser.avatar } }
            continue
        }
        
        # ============ AUTH API: Login ============
        if ($requestUrl -eq "/api/auth/login" -and $method -eq "POST") {
            $body = Get-RequestBody $context.Request
            $data = $body | ConvertFrom-Json
            $users = Read-JsonFile $usersFile
            if (-not $users) { $users = @() }
            if ($users.GetType().Name -ne "Object[]") { $users = @($users) }
            
            $user = $users | Where-Object { $_.username -eq $data.username -and $_.password -eq $data.password }
            if ($user) {
                Send-JsonResponse $response @{ success = $true; user = @{ id = $user.id; username = $user.username; avatar = $user.avatar } }
            } else {
                Send-JsonResponse $response @{ success = $false; error = "Invalid username or password" } 401
            }
            continue
        }

        # ============ AUTH API: Update Profile ============
        if ($requestUrl -eq "/api/auth/update" -and $method -eq "POST") {
            $body = Get-RequestBody $context.Request
            $data = $body | ConvertFrom-Json
            $users = Read-JsonFile $usersFile
            if (-not $users) { $users = @() }
            if ($users.GetType().Name -ne "Object[]") { $users = @($users) }
            
            $user = $users | Where-Object { $_.id -eq $data.userId }
            if ($user) {
                if ($data.username) {
                    $existing = $users | Where-Object { $_.username -eq $data.username -and $_.id -ne $data.userId }
                    if ($existing) {
                        Send-JsonResponse $response @{ success = $false; error = "Username already exists" } 400
                        continue
                    }
                    $user.username = $data.username
                }
                if ($data.avatar) {
                    $user.avatar = $data.avatar
                }
                if ($data.password) {
                    $user.password = $data.password
                }
                Write-JsonFile $usersFile $users
                Send-JsonResponse $response @{ success = $true; user = @{ id = $user.id; username = $user.username; avatar = $user.avatar } }
            } else {
                Send-JsonResponse $response @{ success = $false; error = "User not found" } 404
            }
            continue
        }
        
        
        # ============ COMMENTS API: Get ============
        if ($requestUrl -match "^/api/comments/(.+)$" -and $method -eq "GET") {
            $episodeKey = $Matches[1]
            $allComments = Read-JsonFile $commentsFile
            if (-not $allComments) { $allComments = @{} }
            
            $epComments = @()
            if ($allComments.PSObject.Properties.Name -contains $episodeKey) {
                $epComments = $allComments.$episodeKey
            }
            Send-JsonResponse $response @{ success = $true; comments = $epComments }
            continue
        }
        
        # ============ COMMENTS API: Post ============
        if ($requestUrl -eq "/api/comments" -and $method -eq "POST") {
            $body = Get-RequestBody $context.Request
            $data = $body | ConvertFrom-Json
            $allComments = Read-JsonFile $commentsFile
            if (-not $allComments) { $allComments = @{} }
            
            $episodeKey = $data.episodeKey
            if (-not ($allComments.PSObject.Properties.Name -contains $episodeKey)) {
                $allComments | Add-Member -NotePropertyName $episodeKey -NotePropertyValue @()
            }
            
            $comment = @{
                id = [guid]::NewGuid().ToString().Substring(0,8)
                userId = $data.userId
                username = $data.username
                avatar = $data.avatar
                text = $data.text
                image = if ($data.image) { $data.image } else { "" }
                likes = @()
                replies = @()
                createdAt = (Get-Date).ToString("o")
            }
            
            if ($data.parentId) {
                $comments = @($allComments.$episodeKey)
                for ($i = 0; $i -lt $comments.Length; $i++) {
                    if ($comments[$i].id -eq $data.parentId) {
                        $replies = @($comments[$i].replies)
                        if (-not $replies) { $replies = @() }
                        $replies += $comment
                        $comments[$i].replies = $replies
                        break
                    }
                }
                $allComments.$episodeKey = $comments
            } else {
                $epComments = @($allComments.$episodeKey) + @($comment)
                $allComments.$episodeKey = $epComments
            }
            
            Write-JsonFile $commentsFile $allComments
            Send-JsonResponse $response @{ success = $true; comment = $comment }
            continue
        }
        
        # ============ COMMENTS API: Like ============
        if ($requestUrl -eq "/api/comments/like" -and $method -eq "POST") {
            $body = Get-RequestBody $context.Request
            $data = $body | ConvertFrom-Json
            $allComments = Read-JsonFile $commentsFile
            
            $episodeKey = $data.episodeKey
            $commentId = $data.commentId
            $userId = $data.userId
            
            if ($allComments.PSObject.Properties.Name -contains $episodeKey) {
                $comments = @($allComments.$episodeKey)
                for ($i = 0; $i -lt $comments.Length; $i++) {
                    if ($comments[$i].id -eq $commentId) {
                        $likes = @($comments[$i].likes)
                        if ($likes -contains $userId) { $likes = $likes | Where-Object { $_ -ne $userId } } 
                        else { $likes += $userId }
                        $comments[$i].likes = $likes
                        break
                    }
                }
                $allComments.$episodeKey = $comments
                Write-JsonFile $commentsFile $allComments
            }
            Send-JsonResponse $response @{ success = $true }
            continue
        }

        # ============ COMMENTS API: Delete ============
        if ($requestUrl -eq "/api/comments" -and $method -eq "DELETE") {
            $body = Get-RequestBody $context.Request
            $data = $body | ConvertFrom-Json
            $allComments = Read-JsonFile $commentsFile
            
            $episodeKey = $data.episodeKey
            $commentId = $data.commentId
            $userId = $data.userId
            
            if ($allComments.PSObject.Properties.Name -contains $episodeKey) {
                $comments = @($allComments.$episodeKey)
                $newComments = @()
                foreach ($c in $comments) {
                    if ($c.id -eq $commentId) {
                        # Only author can delete
                        if ($c.userId -ne $userId) { $newComments += $c }
                    } else {
                        # Also check inside replies
                        $newReplies = @()
                        $replies = @($c.replies)
                        foreach ($r in $replies) {
                            if ($r.id -eq $commentId) {
                                if ($r.userId -ne $userId) { $newReplies += $r }
                            } else { $newReplies += $r }
                        }
                        $c.replies = $newReplies
                        $newComments += $c
                    }
                }
                $allComments.$episodeKey = $newComments
                Write-JsonFile $commentsFile $allComments
            }
            Send-JsonResponse $response @{ success = $true }
            continue
        }
        
        # ============ UPLOAD API ============
        if ($requestUrl -eq "/api/upload" -and $method -eq "POST") {
            $body = Get-RequestBody $context.Request
            $data = $body | ConvertFrom-Json
            $fileName = [guid]::NewGuid().ToString().Substring(0,8) + ".png"
            $filePath = Join-Path $uploadsDir $fileName
            $imageData = $data.image -replace "^data:image/[^;]+;base64,", ""
            [System.IO.File]::WriteAllBytes($filePath, [Convert]::FromBase64String($imageData))
            Send-JsonResponse $response @{ success = $true; url = "/data/uploads/$fileName" }
            continue
        }
        
        # ============ STATIC FILE SERVER ============
        $filePath = [System.IO.Path]::GetFullPath((Join-Path $PWD.Path $requestUrl))
        if ($filePath.StartsWith($PWD.Path) -and (Test-Path $filePath -PathType Leaf)) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            switch ($ext) {
                ".html" { $response.ContentType = "text/html; charset=utf-8" }
                ".css"  { $response.ContentType = "text/css; charset=utf-8" }
                ".js"   { $response.ContentType = "application/javascript; charset=utf-8" }
                ".json" { $response.ContentType = "application/json; charset=utf-8" }
                ".png"  { $response.ContentType = "image/png" }
                ".jpg"  { $response.ContentType = "image/jpeg" }
                ".jpeg" { $response.ContentType = "image/jpeg" }
                ".gif"  { $response.ContentType = "image/gif" }
                ".svg"  { $response.ContentType = "image/svg+xml" }
                ".webp" { $response.ContentType = "image/webp" }
                default { $response.ContentType = "application/octet-stream" }
            }
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        } else {
            $response.StatusCode = 404
            $errorBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $errorBytes.Length
            $response.OutputStream.Write($errorBytes, 0, $errorBytes.Length)
        }
        $response.Close()
    }
    catch {
        Write-Host "Request Processing Error: $_" -ForegroundColor Yellow
        if ($response) { try { $response.StatusCode = 500; $response.Close() } catch {} }
    }
}
