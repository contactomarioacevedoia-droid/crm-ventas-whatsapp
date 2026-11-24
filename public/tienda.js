const dialog = document.querySelector('#demo');
const form = document.querySelector('#demo-form');
const status = document.querySelector('#demo-status');
const products = document.querySelector('#products');
const whatsapp = document.querySelector('#whatsapp');
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
const details = {
  soporte: 'Eleva tu notebook y libera espacio.',
  tapete: 'Fieltro verde para enmarcar tu escritorio.',
  kit: 'El soporte y el tapete en un solo pedido.',
};

function openDemo(message) {
  form.elements.text.value = message;
  status.textContent = '';
  dialog.showModal();
}

document.querySelector('#try').addEventListener('click', () => openDemo(
  'Hola, ¿tienen 12 kits para equipar una oficina? ¿Puedo pasar a verlos?'
));
document.querySelector('#try-person').addEventListener('click', () => openDemo(
  'Hola, necesito 12 kits. ¿Puedo hablar con un vendedor para revisar el despacho?'
));
for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => dialog.close());
}

function waLink(phone, message) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

async function loadStore() {
  const response = await fetch('/api/store');
  if (!response.ok) throw new Error('No se pudo cargar el catálogo.');
  const { store, phone, catalog } = await response.json();
  document.querySelector('[data-brand]').textContent = store;
  document.title = `${store} · Accesorios de escritorio`;
  if (phone) {
    whatsapp.href = waLink(phone, `Hola, quiero consultar por los accesorios de ${store}.`);
    whatsapp.hidden = false;
  }
  for (const product of catalog) {
    const card = document.createElement('article');
    card.className = 'product';
    const image = document.createElement('div');
    image.className = `product-photo ${product.id}`;
    const title = document.createElement('h3');
    title.textContent = product.name;
    const description = document.createElement('p');
    description.textContent = details[product.id];
    const price = document.createElement('strong');
    price.textContent = money.format(product.price);
    const request = `Hola, ¿me das disponibilidad y precio de ${product.name}?`;
    const action = phone ? document.createElement('a') : document.createElement('button');
    action.className = 'button';
    if (phone) {
      action.textContent = 'Consultar por WhatsApp';
      action.href = waLink(phone, request);
      action.target = '_blank';
      action.rel = 'noopener';
    } else {
      action.textContent = 'Simular consulta';
      action.addEventListener('click', () => openDemo(request));
    }
    card.append(image, title, description, price, action);
    products.append(card);
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const response = await fetch(button.value === 'agente' ? '/api/ensayar' : '/api/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.elements.name.value, text: form.elements.text.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    location.href = `/crm?contacto=${result.id}`;
  } catch (error) {
    status.textContent = error.message;
    button.disabled = false;
  }
});

loadStore().catch(error => { products.textContent = error.message; });
