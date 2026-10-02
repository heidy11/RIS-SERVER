# Arranca todo lo necesario para la prueba de worklist en esta laptop:
# Docker, el PACS, MongoDB, el backend, el frontend y el navegador.
param(
  [string]$Frontend = (Join-Path $PSScriptRoot '..\..\..\RIS')
)

$backend = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$frontendPath = (Resolve-Path $Frontend).Path

function Docker-Listo {
  & docker info 2>&1 | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Puerto-Ocupado([int]$puerto) {
  return [bool](Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue)
}

# 1. Docker Desktop no arranca solo con Windows: si no responde, se abre y se espera.
if (-not (Docker-Listo)) {
  Write-Host 'Abriendo Docker Desktop (puede tardar 1-2 minutos)...'
  Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  $intentos = 0
  while (-not (Docker-Listo)) {
    $intentos++
    if ($intentos -gt 60) {
      Write-Host 'Docker no arranco despues de 3 minutos. Abri Docker Desktop a mano y volve a correr este script.' -ForegroundColor Red
      exit 1
    }
    Start-Sleep -Seconds 3
  }
}
Write-Host 'Docker listo.' -ForegroundColor Green

# 2. PACS (DCM4CHEE) y MongoDB.
Write-Host 'Levantando el PACS y la base de datos...'
docker compose -f (Join-Path $backend 'pacs-lab\docker-compose.yml') up -d
docker start ris-mongo | Out-Null

Write-Host 'Esperando a que el PACS termine de arrancar...'
$pacsListo = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 'http://localhost:8080/dcm4chee-arc/aets/WORKLIST/rs/mwlitems/count' | Out-Null
    $pacsListo = $true
    break
  } catch {
    Start-Sleep -Seconds 3
  }
}
if (-not $pacsListo) {
  Write-Host 'El PACS no respondio a tiempo. Revisa Docker Desktop y volve a correr el script.' -ForegroundColor Red
  exit 1
}
Write-Host 'PACS listo.' -ForegroundColor Green

# 3. Backend y frontend, cada uno en su propia ventana (si ya estaban corriendo, no se duplican).
if (Puerto-Ocupado 5000) {
  Write-Host 'El backend ya estaba corriendo.'
} else {
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$backend'; npm start"
}
if (Puerto-Ocupado 5173) {
  Write-Host 'El frontend ya estaba corriendo.'
} else {
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$frontendPath'; npm run dev"
  Start-Sleep -Seconds 8
}
Start-Process 'http://localhost:5173'

# 4. Datos para configurar el tomografo.
Write-Host ''
Write-Host '=== Datos para el tecnico del tomografo ===' -ForegroundColor Cyan
Write-Host 'AE Title del servidor de worklist : WORKLIST'
Write-Host 'Puerto                            : 11112'
Write-Host 'IP de esta laptop (usar la de la red a la que esta conectado el tomografo):'
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -notlike 'vEthernet*' } |
  ForEach-Object { Write-Host ("   {0,-15}  ({1})" -f $_.IPAddress, $_.InterfaceAlias) }
