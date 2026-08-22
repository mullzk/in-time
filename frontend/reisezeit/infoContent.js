// The Reisezeit panel's info-modal content. Kept apart from the modal shell so
// the copy lives in one place.

const link = (label, href) => ({ label, href });

export function buildInfoContent() {
  return {
    title: 'All in Time',
    intro: [
      [
        'Die Reisezeit-Ansicht zeigt, wie weit man von einem Ort aus kommt. ' +
          'Jede Station liegt in der Richtung, in der sie wirklich liegt — ' +
          'aber so weit draussen, wie die Fahrt dorthin dauert. Ein Ring ist ' +
          'eine Stunde Reisezeit. Wo das Land zusammenschrumpft, ist der ' +
          'Fahrplan schnell; wo es sich dehnt, dauert es.',
      ],
      [
        'Gerechnet wird ab 07:00 Uhr, mit dem Fahrplan des heutigen Tages ' +
          'gemäss ',
        link('opentransportdata.swiss', 'https://opentransportdata.swiss'),
        '. Umgestiegen wird nur innerhalb eines Umsteigeknotens, mit zwei ' +
          'Minuten Mindest-Umsteigezeit. Quellcode: ',
        link(
          'github.com/mullzk/in-time/',
          'https://github.com/mullzk/in-time/',
        ),
        '.',
      ],
    ],
    controlHelp:
      'Der Standort wird über das Suchfeld oben gewählt, gezoomt wird mit ' +
      'dem Mausrad oder mit + und −. Die Ansicht wird über das Dock am ' +
      'linken Rand gewechselt.',
    shortcuts: [
      { keys: '+', description: 'Hineinzoomen' },
      { keys: '−', description: 'Herauszoomen' },
      { keys: 'F', description: 'Ganzes Bild einpassen' },
      { keys: 'G', description: 'Stationssuche öffnen' },
      { keys: 'I', description: 'Diese Information öffnen und schließen' },
    ],
  };
}
