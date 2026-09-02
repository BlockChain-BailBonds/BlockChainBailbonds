#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {createService} from './factory.mjs';

function parseArgs(argv) {
  const args = {_: []};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) args._.push(token);
    else {
      const [name, inline] = token.slice(2).split('=', 2);
      if (inline !== undefined) args[name] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[name] = argv[++i];
      else args[name] = true;
    }
  }
  return args;
}

function required(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`--${name} is required`);
  return value.trim();
}

function authorization(args, service) {
  return {
    scope: args.scope ?? 'owned_asset',
    asset_id: required(args, 'asset'),
    purpose: required(args, 'purpose'),
    region_profile: args.region ?? service.config.regionProfile,
    operator_id: required(args, 'operator'),
    ...(args.expires ? {expires_at: new Date(args.expires).toISOString()} : {}),
  };
}

async function readJsonFile(file) {
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON file must contain an object');
  return parsed;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  console.log(`M3rMa1d S1r3n Codex production CLI

Commands:
  readiness
  plan --task "..." --asset ID --purpose "..." --operator ID [--scope owned_asset|isolated_lab]
  preview --file run.json
  run --file run.json
  run --task "..." --asset ID --purpose "..." --operator ID
  inventory --refresh
  catalog
  status
  stop [--reason "..."]
  resume --confirm RESUME [--reason "..."]
  stage-artifact --id ID --kind KIND --file PATH [--sha256 HEX]
  register-asset --asset ID --source "owner record" [--profile ID --frequency HZ]
  promote-adapter --adapter ID --operator ID --evidence-sha256 HEX
  promote-script --script ID --operator ID --evidence-sha256 HEX
  audit-verify

Required environment:
  OPENAI_API_KEY
  S1R3N_API_TOKEN
  S1R3N_CORE_URL
  S1R3N_CONTROL_KEY

The CLI never substitutes a simulated Core or Flipper. Preview resolves and materializes without execution; run requires signed hardware readiness from the real Core, all three C5 safety nodes, the CYD Deck, and the Flipper.
`);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
if (!command || command === 'help' || args.help) {
  usage();
  process.exit(0);
}

const service = await createService();

switch (command) {
  case 'readiness':
    print(await service.readiness({requireStopCleared: false}));
    break;
  case 'plan': {
    const task = required(args, 'task');
    print(await service.planTask({task, authorization: authorization(args, service), runId: args['run-id']}));
    break;
  }
  case 'preview':
    print(await service.previewAdl(await readJsonFile(required(args, 'file'))));
    break;
  case 'run':
    if (args.file) print(await service.runAdl(await readJsonFile(args.file)));
    else {
      const task = required(args, 'task');
      print(await service.runTask({task, authorization: authorization(args, service), runId: args['run-id']}));
    }
    break;
  case 'inventory':
    if (args.refresh !== true) throw new Error('production inventory requires --refresh');
    print(await service.inventory({refresh: true}));
    break;
  case 'catalog':
    print(await service.catalog.snapshot());
    break;
  case 'status':
    print({...await service.readiness({requireStopCleared: false}), active_runs: service.activeRuns});
    break;
  case 'stop':
    print(await service.assertStop(args.reason ?? 'CLI stop'));
    break;
  case 'resume':
    if (args.confirm !== 'RESUME') throw new Error('resume requires --confirm RESUME');
    print(await service.clearStop({authenticated: true, reason: args.reason ?? 'CLI resume'}));
    break;
  case 'stage-artifact':
    print(await service.artifacts.stageLocalFile({
      id: required(args, 'id'),
      kind: required(args, 'kind'),
      filePath: required(args, 'file'),
      expectedSha256: args.sha256,
    }));
    break;
  case 'register-asset': {
    const assetId = required(args, 'asset');
    const source = required(args, 'source');
    const profiles = args.profile ? [args.profile] : [];
    const frequencies = args.profile && args.frequency ? {[args.profile]: Number(args.frequency)} : {};
    print(await service.frequencies.registerOwnedAsset({assetId, source, frequencyProfiles: profiles, frequencies}));
    break;
  }
  case 'promote-adapter': {
    const promoted = await service.catalog.promoteGeneratedAdapter({
      adapterId: required(args, 'adapter'),
      operatorId: required(args, 'operator'),
      testEvidenceSha256: required(args, 'evidence-sha256'),
    });
    await service.audit.write({
      event: 'adapter.promoted',
      adapter_id: promoted.adapter_id,
      sha256: promoted.sha256,
      verified_by: promoted.verified_by,
      test_evidence_sha256: promoted.test_evidence_sha256,
    });
    print(promoted);
    break;
  }
  case 'promote-script': {
    const promoted = await service.catalog.promoteGeneratedScript({
      scriptId: required(args, 'script'),
      operatorId: required(args, 'operator'),
      testEvidenceSha256: required(args, 'evidence-sha256'),
    });
    await service.audit.write({
      event: 'script.promoted',
      script_id: promoted.script_id,
      sha256: promoted.sha256,
      verified_by: promoted.verified_by,
      test_evidence_sha256: promoted.test_evidence_sha256,
    });
    print(promoted);
    break;
  }
  case 'audit-verify':
    print(await service.audit.verify());
    break;
  default:
    usage();
    process.exitCode = 2;
}
