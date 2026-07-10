/**
 * Convierte los checkboxes de las listas de tareas de Markdown en glifos
 * accesibles.
 *
 * `- [ ] item` genera `<input type="checkbox" disabled>`, un control de
 * formulario sin etiqueta: falla la auditoría `label` de Lighthouse y un
 * lector de pantalla lo anuncia como "casilla, deshabilitada", sin decir qué
 * casilla. Como el estado nunca cambia, no es un control: es un icono de
 * estado. Lo reemplazamos por un `<span role="img">` con nombre accesible.
 */
export function rehypeTaskList() {
  return (tree) => {
    walk(tree, (node, parent, index) => {
      if (node.tagName !== 'input' || node.properties?.type !== 'checkbox') return;

      const done = Boolean(node.properties.checked);
      parent.children[index] = {
        type: 'element',
        tagName: 'span',
        properties: {
          className: ['task-box', done ? 'task-box--done' : 'task-box--todo'],
          role: 'img',
          'aria-label': done ? 'Hecho' : 'Pendiente',
        },
        children: [{ type: 'text', value: done ? '✓' : '' }],
      };
    });
  };
}

function walk(node, fn, parent = null, index = -1) {
  if (parent && node.type === 'element') fn(node, parent, index);
  const children = node.children ?? [];
  // Recorremos hacia atrás: fn reemplaza in situ y no queremos reprocesar.
  for (let i = children.length - 1; i >= 0; i--) walk(children[i], fn, node, i);
}
