export function el(tag, text, attrs={}) {
  const node = document.createElement(tag);
  if (text !== null && text !== undefined) node.textContent = text;
  for (const [key,value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key,value);
  }
  return node;
}
export function download(name, value) {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}));
  const a = el('a',null,{href:url,download:name}); document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
