# Hace la misma consulta de worklist que hace el tomografo (C-FIND MWL por DICOM,
# puerto 11112) y muestra lo que apareceria en su pantalla.
param(
  [string]$AeEquipo = 'CT01',   # AE Title con el que se presenta el equipo
  [string]$Modalidad = 'CT',
  [string]$Servidor = 'arc',    # 'arc' = el PACS de esta laptop; si no, la IP del PACS
  [int]$Puerto = 11112,
  [switch]$Completo             # muestra la salida entera de la herramienta, para diagnosticar
)

$dockerArgs = @('run', '--rm')
if ($Servidor -eq 'arc') { $dockerArgs += @('--network', 'pacs-lab_default') }
$dockerArgs += @(
  'dcm4che/dcm4che-tools:5.35.1', 'findscu', '-M', 'MWL',
  '-b', $AeEquipo, '-c', "WORKLIST@${Servidor}:$Puerto",
  '-m', "00400100.00080060=$Modalidad",
  '-r', 'PatientName', '-r', 'PatientID', '-r', 'AccessionNumber',
  '-r', '00400100.00400001', '-r', '00400100.00400002',
  '-r', '00400100.00400003', '-r', '00400100.00400007'
)

Write-Host "Consultando la worklist como el equipo '$AeEquipo' (modalidad $Modalidad) en WORKLIST@${Servidor}:$Puerto ..."
$salida = & docker @dockerArgs 2>&1 | ForEach-Object { "$_" }

if ($Completo) {
  $salida
  exit
}

# findscu imprime tambien la consulta que envia, con los valores vacios ([]); solo
# interesan las respuestas, que traen valor.
$campos = $salida |
  Select-String -Pattern '\((0008,0050|0010,0010|0010,0020|0040,0001|0040,0002|0040,0003|0040,0007)\)' |
  Where-Object { $_.Line -notmatch '\[\]' }
if ($campos) {
  $campos | ForEach-Object { $_.Line.Trim() }
  $citas = @($campos | Where-Object { $_.Line -match '\(0010,0010\)' }).Count
  Write-Host ''
  Write-Host "$citas cita(s) en la worklist para este equipo." -ForegroundColor Green
} else {
  Write-Host 'No aparecio ninguna cita. Revisa que la cita sea de hoy y de la misma modalidad,' -ForegroundColor Yellow
  Write-Host 'o corre de nuevo con -Completo para ver el detalle del error.' -ForegroundColor Yellow
}
