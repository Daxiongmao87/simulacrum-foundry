import { ClassicLevel } from 'classic-level';
console.log('ClassicLevel imported successfully');
const db = new ClassicLevel('./packs/test-db');
await db.open();
await db.put('test', 'value');
await db.close();
console.log('Written to debug DB');
