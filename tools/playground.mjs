// Reproduce an exported browser scenario using the unchanged original Node SDK.
import{readFileSync,lstatSync}from'node:fs';import * as original from '../sdk/core/dist/core/index.js';
import{createPortableReplayKernel}from'../sdk/core/dist/core/portable-replay.js';
import{captureBoundedCanonicalReplayBodyIncrementally}from'../sdk/core/dist/core/canonical.js';
import{parseCase,runCase}from'../website/playground/model.js';
try{if(process.argv.length!==3)throw Error('Use: node tools/playground.mjs SCENARIO.json');const path=process.argv[2],s=lstatSync(path);if(!s.isFile()||s.size>32768)throw Error('Choose a regular scenario JSON file of at most 32 KB.');const scenario=parseCase(readFileSync(path,'utf8'));const fixture=JSON.parse(readFileSync(new URL('../website/playground/fixture.json',import.meta.url)));const result=runCase({...original,createPortableReplayKernel,captureBoundedCanonicalReplayBodyIncrementally},scenario,fixture);console.log(JSON.stringify({scenario,result},(_,v)=>typeof v==='bigint'?{$bigint:v.toString()}:v,null,2));}catch(e){console.error('Scenario: '+e.message);process.exitCode=2;}
