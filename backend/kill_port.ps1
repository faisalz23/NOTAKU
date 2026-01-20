# Script untuk kill process yang menggunakan port 5001 di Windows
$port = 5001
$process = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
if ($process) {
    Write-Host "Killing process $process on port $port"
    Stop-Process -Id $process -Force
    Write-Host "Port $port is now free"
} else {
    Write-Host "No process found on port $port"
}

