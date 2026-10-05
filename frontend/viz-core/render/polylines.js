// Lines of world coordinates, stroked as the caller has set up the stroke.
export function strokePolylines(p, polylines) {
  polylines.forEach((polyline) => {
    p.beginShape();
    polyline.forEach(([east, north]) => {
      p.vertex(east, north);
    });
    p.endShape();
  });
}
