export function get(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function create(tag: string) {
  return document.createElement(tag);
}

export function listen(el: HTMLElement | Document, event: string, cb: EventListener) {
  el.addEventListener(event, cb);
}

export function addClass(el: HTMLElement, cl: string) {
  const cls = el.getAttribute('class');
  const classes = cls ? cls.split(' ') : [];
  el.setAttribute('class', classes.concat([cl]).join(' '));
}

export function removeClass(el: HTMLElement, cl: string) {
  const cls = el.getAttribute('class');
  const classes = cls ? cls.split(' ') : [];
  const newClasses = [];
  for (const c of classes) {
    if (c !== cl) newClasses.push(c);
  }
  el.setAttribute('class', newClasses.join(' '));
}

export function remove(el: HTMLElement) {
  el.parentNode.removeChild(el);
}

export function isEl(el: any): el is HTMLElement {
  return el instanceof HTMLElement;
}

export function empty(el: HTMLElement) {
  el.innerHTML = '';
}

export function left(el: HTMLElement): number {
  let sum = el.offsetLeft;
  // tslint:disable-next-line:no-conditional-assignment
  while ((el = el.offsetParent as HTMLElement)) sum += el.offsetLeft + el.clientLeft;
  return sum;
}

export function top(el: HTMLElement): number {
  let sum = el.offsetTop;
  // tslint:disable-next-line:no-conditional-assignment
  while ((el = el.offsetParent as HTMLElement)) sum += el.offsetTop + el.clientTop;
  return sum;
}
