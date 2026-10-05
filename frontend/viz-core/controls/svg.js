const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const svgElement = (tag, attributes = {}) => {
  const node = document.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => {
    node.setAttribute(name, String(value));
  });
  return node;
};
