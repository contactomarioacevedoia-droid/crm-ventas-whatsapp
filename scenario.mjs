import { catalog, receive, transaction } from './db.mjs';

const names = [
  'Laura Fuentes', 'Gabriel Ortiz', 'Fernanda Ríos', 'Jorge Salas', 'Paula Medina', 'Tomás Rojas',
  'Consuelo Silva', 'Matías Guerra', 'Sofía Lara', 'Ignacio Mora', 'Antonia León', 'Felipe Ruiz',
  'Rocío Peña', 'Martín Lagos', 'Pilar Núñez', 'Rodrigo Leal', 'Javiera Díaz', 'Francisco Vidal',
  'Daniela Vera', 'Nicolás Vargas', 'Paz Morales', 'Álvaro Reyes', 'Carolina Moya', 'Andrea Rivas',
  'Andrés Molina', 'Marcela Soto', 'Diego Pérez', 'Ana Pardo', 'Valentina Soto', 'Camila Torres', 'Isidora Reyes',
];
const dailyCounts = [1, 2, 1, 3, 2, 1, 0, 2, 4, 3, 1, 3, 4, 4];
const outcomes = ['Ganada', 'Perdida', 'Cotizada', 'En conversación', 'Ganada', 'Nueva', 'Perdida', 'Cotizada'];
const lossReplies = [
  ['Necesitábamos despacho para mañana y ya compramos en otro lado. Gracias.', 'Compró en otra tienda por el plazo de entrega.'],
  ['Se nos sale del presupuesto. Por ahora vamos a dejarlo pasar.', 'La cotización superó el presupuesto del cliente.'],
  ['Van a aplazar la compra hasta que esté lista la oficina.', 'El cliente aplazó la compra.'],
];
const chileDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago', dateStyle: 'short' });
const nextWeekdays = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short' });

export function seedScenario(db, now = new Date()) {
  transaction(db, () => {
    if (db.prepare("SELECT 1 FROM config WHERE key = 'scenario_seeded'").get()) return;
    const today = Date.parse(`${chileDay.format(now)}T12:00:00Z`);
    const quote = db.prepare('INSERT INTO quotes VALUES (?, ?, ?, ?, ?)');
    const visit = db.prepare('INSERT INTO visits VALUES (?, ?)');
    const message = db.prepare('INSERT INTO messages(lead_id, role, body, created) VALUES (?, ?, ?, ?)');
    const lead = db.prepare('UPDATE leads SET stage = ?, created = ?, updated = ?, loss_reason = ?, attention_reason = ? WHERE id = ?');
    let cursor = 0;
    let visitDay = today;
    dailyCounts.forEach((count, day) => {
      for (let slot = 0; slot < count; slot++) {
        const index = cursor++;
        const name = names[index];
        const product = name === 'Valentina Soto' ? catalog[2] : catalog[index % catalog.length];
        const quantity = name === 'Valentina Soto' ? 8 : [2, 6, 12, 3, 8, 1, 5][index % 7];
        let stage = outcomes[index % outcomes.length];
        let ask = `Hola, ¿tienen ${quantity} unidades de ${product.name}? ${index % 2 ? '¿Puedo retirar en tienda?' : 'Es para nuestra oficina.'}`;
        let attention = null;
        if (name === 'Valentina Soto') {
          stage = 'Perdida';
          ask = 'Necesito 8 kits para la oficina. ¿Llegan mañana a Providencia?';
        } else if (name === 'Camila Torres') {
          stage = 'Cotizada';
          ask = 'Necesito equipar la oficina. ¿Puedo hablar con un vendedor para revisar el despacho?';
          attention = 'Pidió hablar con ventas para revisar el despacho.';
        } else if (name === 'Isidora Reyes') {
          stage = 'En conversación';
          ask = 'Hola, busco accesorios para 12 puestos. ¿Me puede llamar alguien del equipo?';
          attention = 'Pidió que el equipo la llame para revisar el pedido.';
        }
        const time = Math.min(now.getTime(), today - (13 - day) * 86_400_000 + slot * 52 * 60_000);
        const at = offset => new Date(Math.min(now.getTime(), time + offset * 60_000)).toISOString();
        const id = receive(db, { name, channel: 'Simulación', body: ask, created: at(0) });
        if (stage !== 'Nueva') {
          message.run(id, 'equipo', stage === 'En conversación'
            ? 'Gracias por escribirnos. ¿En qué comuna te queda mejor recibir el pedido?'
            : `Te cotizamos ${quantity} unidades a partir del precio del catálogo. ¿Te sirve que revisemos la entrega?`, at(18));
        }
        const [reply, lossReason] = lossReplies[name === 'Valentina Soto' ? 0 : index % lossReplies.length];
        if (stage === 'Perdida') message.run(id, 'cliente', reply, at(155));
        if (stage === 'Ganada') message.run(id, 'cliente', 'Sí, confirmo el pedido. Gracias por ayudarme con el retiro.', at(165));
        if (['Ganada', 'Cotizada', 'Perdida'].includes(stage)) quote.run(id, product.id, quantity, product.price, at(18));
        if (['Paz Morales', 'Andrés Molina'].includes(name)) {
          do { visitDay += 86_400_000; } while (['Sat', 'Sun'].includes(nextWeekdays.format(new Date(visitDay))));
          visit.run(id, new Date(visitDay + 4 * 3_600_000).toISOString());
        }
        const last = stage === 'Nueva' ? 0 : stage === 'Perdida' || stage === 'Ganada' ? 165 : 18;
        lead.run(stage, at(0), at(last), stage === 'Perdida' ? lossReason : null, attention, id);
      }
    });
    db.prepare("INSERT INTO config VALUES ('scenario_seeded', 'true')").run();
  });
}
