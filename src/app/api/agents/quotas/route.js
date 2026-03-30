import { NextResponse } from 'next/server';
import { getAvailableProfiles, getProfileHome } from '@/utils/geminiProfiles';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export async function GET() {
  try {
    const profiles = getAvailableProfiles();
    const quotas = [];

    for (const profile of profiles) {
      try {
        const homePath = getProfileHome(profile);

        // Ejecutamos opencode quota o el comando equivalente.
        // Si no existe, simulamos la respuesta por ahora para que no rompa si el CLI no soporta 'quota'
        // Lo correcto sería algo como: await execAsync('gemini quota', { env: { ...process.env, GEMINI_CLI_HOME: homePath } })

        let percentage = 'N/A';
        try {
          const { stdout } = await execAsync('opencode quota --percentage-only', {
            env: { ...process.env, GEMINI_CLI_HOME: homePath },
          });
          percentage = stdout.trim() + '%';
        } catch (e) {
          // Fallback silencioso si opencode no tiene implementado el comando de quota o falla
          percentage = 'Verificando...';
        }

        quotas.push({
          profile,
          quota: percentage,
        });
      } catch (error) {
        quotas.push({
          profile,
          quota: 'Error',
        });
      }
    }

    return NextResponse.json({ success: true, quotas });
  } catch (error) {
    console.error('Error fetching quotas:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
