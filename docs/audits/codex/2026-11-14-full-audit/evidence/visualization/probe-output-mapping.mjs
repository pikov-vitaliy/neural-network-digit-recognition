import { writeFile } from 'node:fs/promises';
import { DigitNetwork } from '../source-snapshot/src/shared/neural-network.js';
import { NetworkView } from '../source-snapshot/public/js/network-view.js';
const network = new DigitNetwork();
for (const layer of network.layers) { layer.weights.fill(0); layer.biases.fill(0); }
network.layers.at(-1).biases[0] = 12;
const result = network.forward(new Float32Array(256));
const calls = [];
const ctx = new Proxy({}, { get: (o, k) => k === 'fillText' ? (text, x, y) => calls.push({text,x,y}) : () => {}, set: (o,k,v) => { o[k]=v; return true; } });
const view = Object.create(NetworkView.prototype);
Object.assign(view, {network, result, grid: {cell:10}, nodeRadius:13, selected:{layer:3,index:0}, positions:network.sizes.map((n,layer)=>Array.from({length:n},(_,index)=>({x:layer*100,y:index*30})))});
view.drawNodes(ctx,{ink:'#fff',muted:'#888',signal:'#00f'});
const inspection=view.getInspection();
const outputText=calls.filter(x=>x.x===300);
const evidence={prediction:result.prediction,probability0:result.probabilities[0],firstOutputNodeText:outputText.slice(0,2),inspection:{layer:inspection.layer,index:inspection.index,activation:inspection.activation,bias:inspection.bias}};
await writeFile(new URL('output-mapping.json',import.meta.url),JSON.stringify(evidence,null,2));
await writeFile(new URL('model-forced-zero.json',import.meta.url),JSON.stringify(network.toJSON()));
const huge = new DigitNetwork();
for(const layer of huge.layers){layer.weights.fill(3e38);layer.biases.fill(3e38);}
await writeFile(new URL('model-finite-overflow.json',import.meta.url),JSON.stringify(huge.toJSON()));
const restored=DigitNetwork.fromJSON(huge.toJSON());
const hugeResult=restored.forward(new Float32Array(256).fill(1));
await writeFile(new URL('finite-overflow.json',import.meta.url),JSON.stringify({importAccepted:true,parametersFinite:huge.layers.every(x=>x.weights.every(Number.isFinite)&&x.biases.every(Number.isFinite)),probabilities:Array.from(hugeResult.probabilities).map(String),confidence:String(hugeResult.confidence),prediction:hugeResult.prediction},null,2));
console.log(JSON.stringify(evidence,null,2));
