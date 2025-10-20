/**
 * Utility functions for DOM manipulation
 */

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attributes?: Record<string, string>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
  }
  return element;
}

export function createDiv(className?: string): HTMLDivElement {
  return createElement("div", className);
}

export function createButton(
  text: string,
  className?: string,
  onClick?: () => void
): HTMLButtonElement {
  const button = createElement("button", className) as HTMLButtonElement;
  // default to type="button" to avoid accidental form submission when used inside forms
  try {
    button.type = "button";
  } catch (e) {
    // ignore if environment prevents setting
  }
  button.textContent = text;
  if (onClick) button.addEventListener("click", onClick);
  return button;
}

export function createInput(
  type: string,
  className?: string,
  placeholder?: string
): HTMLInputElement {
  const input = createElement("input", className, { type, placeholder: placeholder || "" });
  return input;
}

export function createLabel(text: string, htmlFor: string, className?: string): HTMLLabelElement {
  const label = createElement("label", className) as HTMLLabelElement;
  // prefer setting the property to avoid attribute/property mismatches
  label.htmlFor = htmlFor;
  label.textContent = text;
  return label;
}

export function clearElement(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

export function appendChildren(parent: HTMLElement, children: (HTMLElement | SVGElement | Text | null)[]): void {
  children.forEach((child) => {
    if (child) parent.appendChild(child);
  });
}
