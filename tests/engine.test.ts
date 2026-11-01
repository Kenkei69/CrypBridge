import {describe,it,expect,afterAll} from 'vitest';import {db} from '../server/config';import {fixture,validate} from '../server/engine';import {assess} from '../server/attacks';
afterAll(()=>db.$disconnect());
describe('authorization boundary',()=>{
 it('accepts legitimate mock payments and rejects replay',async()=>{const a=await db.agent.findFirstOrThrow();const e=fixture(a.id);expect((await validate(e)).decision).toBe('approve');expect((await validate(e)).decision).toBe('block');});
 it('rejects malformed and live requests',async()=>{expect((await validate({mode:'testnet'})).decision).toBe('block');});
 it('serializes concurrent duplicate requests',async()=>{const a=await db.agent.findFirstOrThrow();const e=fixture(a.id);const results=await Promise.all(Array.from({length:5},()=>validate(e)));expect(results.filter(r=>r.decision==='approve')).toHaveLength(1);});
 it('blocks all attack categories while accepting benign controls',async()=>{const guard=await db.guard.findFirstOrThrow({where:{endpoint:'builtin:secure'}});const r=await assess(guard.id);expect(r.score).toBe(100);});
 it('detects permissive guards',async()=>{const guard=await db.guard.findFirstOrThrow({where:{endpoint:'builtin:vulnerable'}});const r=await assess(guard.id);expect(r.score).toBe(0);});
});
