// The Reisezeit panel's info-modal content. Kept apart from the modal shell so
// the copy lives in one place.

const link = (label, href) => ({ label, href });

export function buildInfoContent() {
  return {
    title: 'All in Time',
    intro: [
      [
        'All in Time macht den Schweizer Taktfahrplan sicht- und hörbar. ' +
          'Entstanden im Rahmen des stets inspirierenden ',
        link(
          'CAS Generative Data Design',
          'https://www.hkb.bfh.ch/de/weiterbildung/cas/generative-data-design/',
        ),
        ' der ',
        link('HKB', 'https://www.hkb.bfh.ch/de/'),
        ', wird der Fahrplan des heutigen Tages gemäss ',
        link('opentransportdata.swiss', 'https://opentransportdata.swiss'),
        ' angezeigt. Weitere Quellen: ',
        link('Bundesamt für Verkehr', 'https://www.bav.admin.ch/de/eisenbahn'),
        ' und ',
        link('swisstopo', 'https://www.swisstopo.admin.ch/de'),
        '. Quellcode: ',
        link(
          'github.com/mullzk/in-time/',
          'https://github.com/mullzk/in-time/',
        ),
        '.',
      ],
      [
        'Die Reisezeit-Karte zeichnet die Schweiz nicht nach Kilometer, ' +
          'sondern nach Fahrtzeit: Vom Ausgangsort gesehen liegt jede Station ' +
          'in der Richtung, in der sie wirklich liegt — aber so weit ' +
          'entfernt, wie die Fahrt dorthin dauert.',
      ],
    ],
    shortcuts: [
      { keys: '+', description: 'Hineinzoomen' },
      { keys: '−', description: 'Herauszoomen' },
      { keys: 'F', description: 'Ganzes Bild einpassen' },
      { keys: 'G', description: 'Stationssuche öffnen' },
      { keys: 'I', description: 'Diese Information öffnen und schließen' },
    ],
  };
}
