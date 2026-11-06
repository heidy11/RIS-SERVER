"""Lee la hoja de datos (DAT) de las planillas Excel del laboratorio de Villa Tunari
y arma un JSON con un registro por fila (paciente + resultados), listo para importar al RIS.

Uso:
  python leer_excel_lab.py salida.json "MAYO RUTINA 2026.xlsm" "OCTUBRE EMERGENCIAS 2026.xlsm" ...

Cada columna de resultados se pasa al campo del RIS por el nombre de su columna en la
planilla (COLUMNAS_EXCEL del frontend, exportado en catalogo-excel.json). Lo que no tiene
campo en el RIS se guarda aparte en `otros` para no perderlo.

El JSON de salida tiene datos de pacientes: se guarda en una carpeta que no se sube a
GitHub y se borra cuando termina la carga.
"""
import collections
import datetime
import json
import os
import sys
import unicodedata
import warnings

import openpyxl

warnings.filterwarnings('ignore')
AQUI = os.path.dirname(os.path.abspath(__file__))

# Columnas fijas de los datos del paciente en la hoja DAT
PACIENTE = {1: 'emergencia', 2: 'paterno', 3: 'materno', 4: 'nombres', 5: 'edad', 6: 'genero', 7: 'avc',
            8: 'benef', 9: 'consultorio', 10: 'medico', 11: 'fecha_solicitud', 12: 'fecha_muestra',
            13: 'fecha_examen', 14: 'telefono', 15: 'diagnostico', 16: 'muestra'}
PRIMERA_RESULTADO = 17

# Valores que la planilla trae prellenados en todas las filas: si un estudio solo tiene
# estos, no se hizo (p. ej. el EGO con urobilinógeno "Normal" y piocitos "(-)")
PRELLENADOS = {'ego': {'urobilinogeno': 'Normal', 'piocitos': '(-)'}}

# Encabezados de la planilla que no coinciden con el nombre de área del RIS
AJUSTES = {
    ('HEMATOLOGIA', 'OBSERVACIONES', 1): ('raiz', 'observaciones'),
    ('QUIMICAS1', 'PAL(FOSFATASA)', 1): ('quimica', 'fal'),
}


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode()
    return s.upper().replace(' ', '').replace('.', '')


def texto(v):
    """Valor de celda como texto del RIS (sin '16.200000001' ni '45.0')."""
    if v is None:
        return ''
    if isinstance(v, bool):
        return 'Sí' if v else 'No'
    if isinstance(v, (int, float)):
        if float(v).is_integer():
            return str(int(v))
        return ('%.4f' % v).rstrip('0').rstrip('.')
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d')
    return str(v).strip()


def fecha(v):
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d')
    t = texto(v)
    for f in ('%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%d/%m/%y'):
        try:
            return datetime.datetime.strptime(t, f).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return ''


def mapa_columnas(r1, r2, columnas):
    """columna -> (categoria, clave) o ('otros', encabezado). Las columnas sin encabezado
    (p. ej. más parásitos en COPRO SIMPLE) se suman a la columna anterior."""
    ref = {}
    for cat, lista in columnas.items():
        cuenta = collections.Counter()
        for c in lista:
            k = (norm(c['area']), norm(c['excel']))
            cuenta[k] += 1
            ref[k + (cuenta[k],)] = (cat, c['key'])
    area, cuenta, mapa, anterior = '', collections.Counter(), {}, None
    for i in range(PRIMERA_RESULTADO, len(r2)):
        if i < len(r1) and r1[i] not in (None, ''):
            area = str(r1[i])
        h = r2[i]
        if h in (None, ''):
            if anterior:
                mapa[i] = ('+',) + anterior  # se agrega a la columna anterior
            continue
        k = (norm(area), norm(h))
        cuenta[k] += 1
        destino = AJUSTES.get(k + (cuenta[k],)) or ref.get(k + (cuenta[k],)) or ('otros', f'{area} / {h}'.strip())
        mapa[i] = destino
        anterior = destino
    return mapa


def leer(path, columnas):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    r1, r2 = [list(r) for r in ws.iter_rows(min_row=1, max_row=2, values_only=True)]
    mapa = mapa_columnas(r1, r2, columnas)
    registros, vacias = [], 0
    for n, row in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
        if not any(row[i] not in (None, '') for i in (2, 3, 4) if i < len(row)):
            vacias += 1
            if vacias > 300:
                break
            continue
        vacias = 0
        p = {campo: row[i] if i < len(row) else None for i, campo in PACIENTE.items()}
        valores, otros, raiz = collections.defaultdict(dict), {}, {}
        for i, destino in mapa.items():
            v = texto(row[i]) if i < len(row) else ''
            if v in ('', '-'):
                continue
            if destino[0] == '+':
                destino = destino[1:]
                previo = (raiz if destino[0] == 'raiz' else otros if destino[0] == 'otros' else valores[destino[0]]).get(destino[1], '')
                v = f'{previo}, {v}' if previo else v
            if destino[0] == 'raiz':
                raiz[destino[1]] = v
            elif destino[0] == 'otros':
                otros[destino[1]] = v
            else:
                valores[destino[0]][destino[1]] = v
        # Una categoría con solo ceros (o solo el TOTAL de la fórmula) no tiene resultados
        for cat in list(valores):
            prellenado = PRELLENADOS.get(cat, {})
            reales = [k for k, v in valores[cat].items()
                      if v not in ('0',) and k != 'formula_total' and prellenado.get(k) != v]
            if not reales:
                del valores[cat]
        registros.append({
            'archivo': os.path.basename(path), 'hoja': ws.title, 'fila': n,
            'paciente': {
                'paterno': texto(p['paterno']).upper(), 'materno': texto(p['materno']).upper(),
                'nombres': texto(p['nombres']).upper(), 'edad': texto(p['edad']),
                'genero': texto(p['genero']).upper()[:1], 'avc': texto(p['avc']).upper(),
                'benef': texto(p['benef']).upper(), 'telefono': texto(p['telefono']),
            },
            'emergencia': texto(p['emergencia']), 'consultorio': texto(p['consultorio']),
            'medico': texto(p['medico']), 'diagnostico': texto(p['diagnostico']), 'muestra': texto(p['muestra']),
            'fecha': fecha(p['fecha_examen']) or fecha(p['fecha_muestra']) or fecha(p['fecha_solicitud']),
            'fecha_solicitud': fecha(p['fecha_solicitud']), 'fecha_muestra': fecha(p['fecha_muestra']),
            'valores': valores, 'raiz': raiz, 'otros': otros,
        })
    # Filas sin ninguna fecha: la planilla se llena día a día en orden, así que se toma la
    # de la fila anterior (o la siguiente si es la primera) y se marca como estimada
    for i, r in enumerate(registros):
        if r['fecha']:
            continue
        cerca = next((x['fecha'] for x in reversed(registros[:i]) if x['fecha'] and not x.get('fecha_estimada')), '')             or next((x['fecha'] for x in registros[i + 1:] if x['fecha']), '')
        if cerca:
            r['fecha'], r['fecha_estimada'] = cerca, True
    return registros, mapa


def main():
    salida, archivos = sys.argv[1], sys.argv[2:]
    cat = json.load(open(os.path.join(AQUI, 'catalogo-excel.json'), encoding='utf-8'))
    todos = []
    for a in archivos:
        regs, mapa = leer(a, cat['columnas'])
        sin_campo = sorted({d[1] for d in mapa.values() if d[0] == 'otros'})
        print(f'{os.path.basename(a)}: {len(regs)} filas con paciente | {sum(1 for d in mapa.values() if d[0] not in ("otros", "+"))} columnas con campo en el RIS')
        if sin_campo:
            print(f'  columnas sin campo (se guardan aparte): {len(sin_campo)}')
        todos += regs
    json.dump({'generado': datetime.datetime.now().isoformat(timespec='seconds'), 'registros': todos},
              open(salida, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'Total: {len(todos)} registros -> {salida}')


if __name__ == '__main__':
    main()
