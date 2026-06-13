import { getDb } from '../../db/localDb'
import { getSwarmMissionDirectorSnapshot } from '../../db/swarmMissions'
import { zedLog } from '../utils/zed-logger'

export const swarmTool = {
  name: 'get_swarm_status',
  description: 'Get the current status of the swarm, including active missions and agents.',
  parameters: {},
  async execute(params, context) {
    zedLog.info('TOOL', 'get_swarm_status', {})

    try {
      const db = getDb()
      const activeMission = db.prepare(
        "SELECT mission_id, title, status FROM swarm_missions WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1"
      ).get()

      if (!activeMission) {
        return { swarm_status: 'no_active_mission', message: 'No active swarm mission' }
      }

      const snapshot = getSwarmMissionDirectorSnapshot(db, activeMission.mission_id)

      return {
        mission: snapshot?.mission || activeMission,
        participants: snapshot?.participants || [],
        active_agents: snapshot?.presence?.active?.length || 0,
        status: 'active'
      }
    } catch (error) {
      return { error: `Cannot get swarm status: ${error.message}` }
    }
  }
}