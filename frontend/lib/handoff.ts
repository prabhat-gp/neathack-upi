/** A tab-local draft, submitted only after the bank workspace mounts. */
export type ComplaintDraft = {
  path: '/channels/chat' | '/channels/udir'
  body: {
    customer_id: string
    text: string
    utr?: string
    case_id?: string | null
  }
  guided: boolean
  state: 'ready' | 'sending' | 'sent'
  caseId?: string
}
const key = (id: string) => `disputepro-draft-${id}`
export function saveDraft(
  draft: ComplaintDraft,
  id: string = crypto.randomUUID(),
): string {
  sessionStorage.setItem(key(id), JSON.stringify(draft))
  return id
}
export function readDraft(id: string): ComplaintDraft | null {
  const value = sessionStorage.getItem(key(id))
  if (!value) return null
  const draft = JSON.parse(value) as ComplaintDraft
  if (
    !['/channels/chat', '/channels/udir'].includes(draft.path) ||
    !draft.body?.customer_id ||
    typeof draft.body.text !== 'string'
  )
    throw new Error('The complaint draft is invalid.')
  return draft
}
