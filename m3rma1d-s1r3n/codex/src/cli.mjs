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

function authorization(args, service) {
  return {
    scope: args.scope ?? 'owned_asset',
    asset_id: args.asset ?? 'lab-device',
    purpose: args.purpose ?? args.task ?? 'authorized M3rMa1d S1r3n operation',
    region_profile: args.region ?? service.config.regionProfile,
    operator_id: args.operator ?? 'local-operator',
  };
}

async function readJsonFile(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage() {
  console.log(`M3rMa1d S1r3n Codex

Commands:
  plan --task "..." --asset ID [--scope owned_asset|isolated_lab]
  preview --file run.json
  run --file run.json
  run --task "..." --asset ID
  inventory [--refresh]
  catalog
  status
  stop [--reason "..."]
  resume --confirm RESUME [--reason "..."]
  register-asset --asset ID --source "owner record" [--profile ID --frequency HZ]
  audit-verify

Environment:
  OPENAI_API_KEY is required for plan and natural-language run.
  S1R3N_DRY_RUN defaults true. Hardware runs require false plus S1R3N_CORE_URL and S1R3N_CONTROL_KEY.
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
  case 'plan': {
    if (!args.task) throw new Error('--task is required');
    print(await service.planTask({task: args.task, authorization: authorization(args, service), runId: args['run-id']}));
    break;
  }
  case 'preview': {
    if (!args.file) throw new Error('--file is required');
    print(await service.previewAdl(await readJsonFile(args.file)));
    break;
  }
  case 'run': {
    if (args.file) print(await service.runAdl(await readJsonFile(args.file)));
    else {
      if (!args.task) throw new Error('--task or --file is required');
      print(await service.runTask({task: args.task, authorization: authorization(args, service), runId: args['run-id']}));
    }
    break;
  }
  case 'inventory':
    print(await service.inventory({refresh: args.refresh === true}));
    break;
  case 'catalog':
    print(await service.catalog.snapshot());
    break;
  case 'status': {
    const [stop, control] = await Promise.all([service.stop.snapshot(), service.transport.status()]);
    print({stop, control, dry_run: service.config.execution.dryRun});
    break;
  }
  case 'stop':
    print(await service.assertStop(args.reason ?? 'CLI stop'));
    break;
  case 'resume':
    if (args.confirm !== 'RESUME') throw new Error('resume requires --confirm RESUME');
    print(await service.clearStop({authenticated: true, reason: args.reason ?? 'CLI resume'}));
    break;
  case 'register-asset': {
    if (!args.asset || !args.source) throw new Error('--asset and --source are required');
    const profiles = args.profile ? [args.profile] : [];
    const frequencies = args.profile && args.frequency ? {[args.profile]: Number(args.frequency)} : {};
    print(await service.frequencies.registerOwnedAsset({assetId: args.asset, source: args.source, frequencyProfiles: profiles, frequencies}));
    break;
  }
  case 'audit-verify':
    print(await service.audit.verify());
    break;
  default:
    usage();
    process.exitCode = 2;
}
