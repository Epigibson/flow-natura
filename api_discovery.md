# Descubrimiento de API Interna (Camino de Crecimiento)

¡Excelentes noticias! El interceptor funcionó a la perfección. Hemos descubierto que Natura no procesa tu nivel en la pantalla directamente, sino que hace una petición a un API interna (GraphQL) la cual devuelve absolutamente **todo tu perfil**.

### El Endpoint Secreto
Natura utiliza el siguiente servidor para despachar los datos:
- **URL**: `https://cn-development-apigw.prd.naturacloud.com/growthplan`
- **Método**: `POST`

### Lo que devuelve (JSON)
Al inspeccionar las respuestas que capturamos, encontramos un paquete de información sumamente valioso. Te devuelve no solo tu nivel y puntos, sino cómo se estructura todo el plan en tu país.

Aquí te muestro lo que envía el sistema para tu usuario:

```json
{
  "consultantLevel": {
    "person_code": "5959327",
    "level": {
      "code": 4,
      "description": "Zafiro",
      "maintenanceValue": 4500,
      "maintenanceGap": 247
    },
    "cycle": "202605",
    "nextLevel": "Diamante",
    "period": {
      "actualCycleDateStart": "18/03/2026",
      "actualCycleDateEnd": "07/04/2026",
      "actualCycleTotalDays": 21,
      "daysFinalDate": 6,
      "cyclesQnty": 9,
      "periodDateStart": "24/12/2025",
      "periodDateEnd": "23/06/2026"
    },
    "nextLevelProgress": {
      "currentValue": 4253,
      "nextValueMin": 13000,
      "gap": 8747,
      "progressPercentage": 33,
      "isAchieved": false
    },
    "nextLevelsParameters": [
      {
        "levelName": "Diamante",
        "minPointsValue": 13000
      },
      {
        "levelName": "Diamante Azul",
        "minPointsValue": 64000
      }
    ]
  }
}
```

### ¿Qué significa esto para ti?
Esto significa que literalmente **podemos clonar el sistema**.
- El endpoint nos dice exactamente cuántos **Días Faltan** para el cierre del ciclo (`daysFinalDate: 6`).
- Nos dice tu progreso exacto hacia Diamante (`33%`) y que te faltan `8,747` puntos (`gap`).
- Incluso te avisa del nivel *después* del siguiente (Diamante Azul) y cuántos puntos pide (`64,000`).
- Adicionalmente, revela que tu nivel actual tiene un "Mantenimiento" (`maintenanceGap: 247`), es decir, lo que debes vender mínimo para mantenerte como Zafiro.

**Si logramos mantener viva la sesión (Token) en el backend, ni siquiera tendrías que usar web-scraping.** Podrías hacer una solicitud `POST` directamente desde el código a ese servidor y clonar esta información mágicamente a tu Dashboard.
