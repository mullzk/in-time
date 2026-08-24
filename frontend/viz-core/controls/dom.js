export const element = (tag, className) => {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  return node;
};
