// The Ausbreitung panel's info-modal content. Kept apart from the modal shell so
// the copy lives in one place.

const link = (label, href) => ({ label, href });

export function buildInfoContent() {
  return {
    title: 'All in Time',
    intro: [
      [
        'Die Ausbreitung zeigt, wie sich eine Reise über das Land legt: Ab ' +
          'dem gewählten Ort und der gewählten Abfahrtszeit fahren genau ' +
          'jene Fahrzeuge, die man tatsächlich nähme. Jeder erreichte Ort ' +
          'leuchtet im Moment der Ankunft auf und bleibt als Punkt zurück.',
      ],
      [
        'Gerechnet wird mit dem Fahrplan des heutigen Tages gemäss ',
        link('opentransportdata.swiss', 'https://opentransportdata.swiss'),
        '. Umgestiegen wird nur innerhalb eines Umsteigeknotens, mit zwei ' +
          'Minuten Mindest-Umsteigezeit; auf eine Verbindung wird höchstens ' +
          'zwei Stunden gewartet. Quellcode: ',
        link(
          'github.com/mullzk/in-time/',
          'https://github.com/mullzk/in-time/',
        ),
        '.',
      ],
    ],
    controlHelp:
      'Der Standort wird über das Suchfeld oben oder mit einem Klick auf ' +
      'einen erreichten Ort gewählt; ein Klick auf ein Fahrzeug zeigt, ' +
      'woher es kommt und wohin es fährt. Die Seitenleiste (☰ oben links) ' +
      'trägt die Abfahrtszeit, den Hintergrund und den Zoom; das Tempo der ' +
      'Wiedergabe steht unten am Bildrand.',
    shortcuts: [
      { keys: 'Leertaste', description: 'Wiedergabe anhalten und fortsetzen' },
      { keys: '+', description: 'Hineinzoomen' },
      { keys: '−', description: 'Herauszoomen' },
      { keys: 'F', description: 'Ganze Schweiz einpassen' },
      { keys: 'G', description: 'Stationssuche öffnen' },
      { keys: 'S', description: 'Seitenleiste öffnen und schließen' },
      { keys: 'I', description: 'Diese Information öffnen und schließen' },
    ],
  };
}
