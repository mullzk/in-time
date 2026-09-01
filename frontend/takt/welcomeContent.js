// What the welcome shows a first-time visitor: the four tiles worth finding,
// each named by the tile it opens.

export function buildWelcomeContent() {
  return {
    title: 'All in Time',
    lead: 'Der Schweizer Taktfahrplan von heute, in Bewegung. Vier Dinge, bevor es losgeht:',
    place: {
      wide: 'Alles liegt in der Leiste am linken Rand.',
      narrow: 'Alles liegt in der Leiste am unteren Rand.',
    },
    hints: [
      {
        tile: 'sound',
        title: 'Vertonung',
        text: 'Wähle eine Vertonung, und jede Ankunft, jede Abfahrt und jeder Aufenthalt an deiner Haltestelle wird zu einem Ton. Der Takt wird zum Rhythmus.',
      },
      {
        tile: 'views',
        title: 'Ansichten',
        text: 'Drei Blicke auf denselben Fahrplan: Takt zeigt den Puls des Netzes, Ausbreitung, wohin man von hier aus wann kommt, Reisezeit das Land nach Fahrzeit statt nach Kilometern.',
      },
      {
        tile: 'map',
        title: 'Hintergrund',
        text: 'Die Karte unter dem Verkehr lässt sich wechseln – bis hin zum schwarzen Grund, auf dem nur noch die Fahrten stehen.',
      },
      {
        tile: 'elements',
        title: 'Kategorien',
        text: 'Fernverkehr, Regionalverkehr, Tram und Bus lassen sich einzeln ein- und ausblenden.',
      },
    ],
    dismissLabel: 'Los geht’s',
    replayLabel: 'Einführung nochmals zeigen',
  };
}
