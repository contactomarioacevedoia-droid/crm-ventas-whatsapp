import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const stages = ['Nueva', 'En conversación', 'Cotizada', 'Ganada', 'Perdida'];
export const catalog = [
  { id: 'soporte', name: 'Soporte Elevación', price: 24990, stock: 48 },
  { id: 'tapete', name: 'Tapete Pausa', price: 14990, stock: 85 },
  { id: 'kit', name: 'Kit Mesa Norte', price: 39990, stock: 24 },
];

export const fixtures = [
  ['Camila Torres', 'tapete', 15, 'Hola, ¿tienen tapetes verdes para 15 puestos?'],
  ['Diego Pérez', 'soporte', 2, 'Hola, vi el soporte para notebook. ¿Tienen dos?'],
  ['Valentina Soto', 'kit', 8, 'Necesito 8 kits para la oficina. ¿Me ayudas?'],
  ['Andrés Molina', 'tapete', 4, '¿Se puede retirar un pedido de 4 tapetes?'],
  ['Paz Morales', 'soporte', 12, 'Estoy cotizando 12 soportes para mi equipo.'],
  ['Felipe Ruiz', 'kit', 1, 'Quiero un kit para regalo. ¿Hay stock?'],
  ['Daniela Vera', 'tapete', 20, '¿Tienen 20 tapetes para un cowork?'],
  ['Javiera Díaz', 'kit', 30, '¿Me cotizas 30 kits para mi equipo?'],
  ['Rodrigo Leal', 'soporte', 5, 'Hola, ¿puedo retirar cinco soportes?'],
  ['Nicolás Vargas', 'kit', 8, 'Necesito conocer el precio de ocho kits.'],
];

export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, channel TEXT NOT NULL,
      stage TEXT NOT NULL DEFAULT 'Nueva', created TEXT NOT NULL, updated TEXT NOT NULL,
      UNIQUE(channel, phone)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY, lead_id INTEGER NOT NULL REFERENCES leads(id),
      role TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, external_id TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS quotes (
      lead_id INTEGER PRIMARY KEY REFERENCES leads(id), product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL, unit_price INTEGER NOT NULL, created TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visits (
      lead_id INTEGER PRIMARY KEY REFERENCES leads(id), starts TEXT NOT NULL UNIQUE
    );
  `);
  transaction(db, () => {
    const columns = new Set(db.prepare('PRAGMA table_info(leads)').all().map(column => column.name));
    if (!columns.has('loss_reason')) db.exec('ALTER TABLE leads ADD COLUMN loss_reason TEXT');
    if (!columns.has('attention_reason')) db.exec('ALTER TABLE leads ADD COLUMN attention_reason TEXT');
  });
  const defaults = { store: 'Mesa Norte', phone: '', model: '', catalog };
  const insert = db.prepare('INSERT OR IGNORE INTO config VALUES (?, ?)');
  for (const [key, value] of Object.entries(defaults)) insert.run(key, JSON.stringify(value));
  return db;
}

export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function receive(db, { name, phone = null, channel, body, externalId = null, created = new Date().toISOString() }) {
  if (externalId && db.prepare('SELECT 1 FROM messages WHERE external_id = ?').get(externalId)) return null;
  const updated = new Date().toISOString();
  const existing = phone && db.prepare('SELECT id FROM leads WHERE channel = ? AND phone = ?').get(channel, phone);
  const id = existing?.id ?? Number(db.prepare(
    'INSERT INTO leads(name, phone, channel, created, updated) VALUES (?, ?, ?, ?, ?)'
  ).run(name, phone, channel, updated, updated).lastInsertRowid);
  db.prepare('INSERT INTO messages(lead_id, role, body, created, external_id) VALUES (?, ?, ?, ?, ?)').run(
    id, 'cliente', body, created, externalId
  );
  db.prepare('UPDATE leads SET updated = ? WHERE id = ?').run(updated, id);
  const normalized = body.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const asksForPerson = /\b(?:hablar|conversar|contactarme) con (?:una persona|un humano|un vendedor|alguien (?:de ventas|del equipo))\b|\b(?:me puede|me podria|podria) llamar (?:un vendedor|alguien del equipo)\b/.test(normalized);
  if (asksForPerson) {
    db.prepare('UPDATE leads SET attention_reason = ? WHERE id = ?').run('El cliente pidió hablar con una persona.', id);
  }
  return id;
}
