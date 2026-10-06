import joinUrl from '../../../../assets/member-join.mp3?url'
import exitUrl from '../../../../assets/member-exit.mp3?url'

type MemberSound = 'join' | 'exit'

export function memberSoundChanges(
  previous: ReadonlySet<string> | null,
  current: ReadonlySet<string>,
  localPeerId: string,
): MemberSound[] {
  if (!localPeerId || !current.has(localPeerId)) return []
  if (!previous) return ['join']
  const sounds: MemberSound[] = []
  if ([...current].some((id) => id !== localPeerId && !previous.has(id))) sounds.push('join')
  if ([...previous].some((id) => id !== localPeerId && !current.has(id))) sounds.push('exit')
  return sounds
}

export function playMemberSound(sound: MemberSound): void {
  void new Audio(sound === 'join' ? joinUrl : exitUrl).play().catch(() => undefined)
}
