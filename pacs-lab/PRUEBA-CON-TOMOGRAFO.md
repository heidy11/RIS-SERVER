# Prueba con el tomógrafo

Guía para probar la worklist con el equipo real, usando la laptop donde quedó
instalado el sistema (`D:\RIS-NUESTRO`). Todos los comandos se escriben en
PowerShell, parado en `D:\RIS-NUESTRO\RIS-SERVER`.

## 1. Arrancar todo

```powershell
cd D:\RIS-NUESTRO\RIS-SERVER
.\pacs-lab\scripts\iniciar-ris.ps1
```

Abre Docker, el PACS, la base de datos, el backend, el frontend y el navegador
en `http://localhost:5173`. Al final muestra los datos para el técnico del
equipo, incluida la IP de la laptop. Las dos ventanas nuevas que se abren
(backend y frontend) tienen que quedar abiertas.

## 2. Conectar la laptop a la red del tomógrafo

Conectarla por cable o wifi a la misma red del equipo y volver a correr
`iniciar-ris.ps1` (o `ipconfig`) para ver la IP que le dio esa red. Ignorar las
que dicen `vEthernet`, `ZeroTier` o `192.168.56.1`: esas son internas.

Si Windows pregunta si se permite que otros dispositivos de la red encuentren
este equipo, responder **Sí**.

## 3. Qué se configura en el tomógrafo

Lo hace el técnico o aplicacionista del equipo. En la configuración DICOM, agregar
el servidor de worklist (según la marca aparece como *Worklist*, *RIS*,
*HIS/RIS* o *Basic Worklist*):

| Dato | Valor |
| :--- | :--- |
| AE Title del servidor | `WORKLIST` |
| IP | la IP de la laptop en esa red (paso 2) |
| Puerto | `11112` |

Anotar además el **AE Title propio del tomógrafo** (a veces dice *Local AE* o
*Calling AE*): se usa en el paso 4. Si el equipo tiene un botón *Verify*, *Echo*
o *Test*, probarlo: tiene que dar OK.

## 4. Qué se cambia en la laptop

Una sola cosa, desde el RIS: registrar el tomógrafo para que las citas de CT se
le asignen. Muchos equipos solo muestran las citas de su propia estación.

1. En el RIS, **Equipos** → **+ Nuevo**.
2. Completar nombre, modalidad `CT`, el **AE Title del tomógrafo** (exacto,
   distingue mayúsculas), su IP y su puerto DICOM (el técnico lo sabe; suele
   ser `104` o `11112`). Guardar.
3. En la fila del equipo, botón **Probar conexión**: si dice que respondió, la
   laptop llega al tomógrafo por la red.

Con un solo tomógrafo registrado, toda cita CT nueva se le asigna sola. Las
citas creadas antes de registrarlo quedan con la estación de prueba (`CT01`):
agendar una nueva.

## 5. La prueba

1. En el RIS: **Pacientes** → crear un paciente. **Recepción** → agendar una cita
   **para hoy**, modalidad **CT**.
2. Simular primero el equipo desde la laptop, con el AE real del tomógrafo:
   ```powershell
   .\pacs-lab\scripts\simular-tomografo.ps1 -AeEquipo CT_SALA1
   ```
   Tiene que aparecer el paciente con su número de orden.
3. En el tomógrafo: abrir la worklist y actualizar (*Reload*, *Refresh* o
   *Query*). Tiene que aparecer el mismo paciente.

## Si no aparece

| Qué pasa | Qué revisar |
| :--- | :--- |
| El *Echo/Verify* del equipo falla | IP mal escrita, laptop en otra red, o el firewall. Desde la laptop: `ping <IP del tomógrafo>`. |
| El *Echo* da OK pero la lista está vacía | La cita no es de hoy, no es modalidad CT, o el AE del paso 4 no coincide. |
| El simulador muestra la cita pero el equipo no | Filtros en la pantalla de worklist del equipo (fecha, modalidad, "solo mi estación"). |
| El simulador no muestra nada | Correr `.\pacs-lab\scripts\simular-tomografo.ps1 -Completo` y mandar la salida. |

## Opcional: que el estudio vuelva al PACS

Si además se quiere que, al terminar el estudio, las imágenes lleguen al PACS de
la laptop, en el equipo se configura un destino de almacenamiento (*Storage* o
*Archive*): AE Title `DCM4CHEE`, la misma IP y puerto `11112`. Si el equipo
soporta MPPS, se apunta al mismo destino y el RIS marca la cita como en curso o
terminada solo. No es necesario para probar la worklist.
