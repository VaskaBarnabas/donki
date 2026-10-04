// Flowable REST kliens (Basic auth). Csak a rendelésmodul és a fizetési webhook használja.
// Végpontok a Flowable 7.2.0 REST API-ja szerint (a konténer saját OpenAPI leírásából ellenőrizve).

export type FlowableVaria = { name: string; value: unknown; type?: string }

export type FolyamatPeldany = {
  id: string
  businessKey: string | null
  processDefinitionId: string
  ended: boolean
  suspended: boolean
}

export type Feladat = {
  id: string
  name: string
  taskDefinitionKey: string
  processInstanceId: string
  createTime: string
}

type Lista<T> = { data: T[]; total: number }

export class FlowableHiba extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

function alapUrl(): string {
  const url = process.env.FLOWABLE_REST_URL
  if (!url) throw new Error('Hianyzo FLOWABLE_REST_URL')
  return url.replace(/\/$/, '')
}

function authFejlec(): string {
  const user = process.env.FLOWABLE_REST_USER ?? ''
  const pass = process.env.FLOWABLE_REST_PASSWORD ?? ''
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`
}

async function hiv<T>(utvonal: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${alapUrl()}/${utvonal}`, {
    ...init,
    headers: { Authorization: authFejlec(), Accept: 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    const szoveg = await res.text().catch(() => '')
    throw new FlowableHiba(res.status, `Flowable ${init.method ?? 'GET'} ${utvonal}: ${res.status} ${szoveg.slice(0, 300)}`)
  }
  if (res.status === 204) return undefined as T
  const szoveg = await res.text()
  return (szoveg ? JSON.parse(szoveg) : undefined) as T
}

function json(body: unknown): RequestInit {
  return { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
}

function variak(v: Record<string, unknown> = {}): FlowableVaria[] {
  return Object.entries(v).map(([name, value]) => ({ name, value }))
}

/** BPMN telepítése (multipart). Minden telepítés új verziót hoz létre. */
export async function telepit(fajlnev: string, xml: string, nev = fajlnev) {
  const form = new FormData()
  form.append('file', new Blob([xml], { type: 'text/xml' }), fajlnev)
  return hiv<{ id: string; name: string; deploymentTime: string }>(
    `repository/deployments?deploymentName=${encodeURIComponent(nev)}`,
    { method: 'POST', body: form }
  )
}

/** Folyamat indítása a legfrissebb definícióval; a business key a rendelésszám. */
export async function folyamatInditas(
  processDefinitionKey: string,
  businessKey: string,
  valtozok: Record<string, unknown> = {}
): Promise<FolyamatPeldany> {
  return hiv<FolyamatPeldany>('runtime/process-instances', {
    method: 'POST',
    ...json({ processDefinitionKey, businessKey, variables: variak(valtozok) }),
  })
}

/** null, ha a folyamatpéldány már nem fut (befejeződött vagy törölték). */
export async function folyamatPeldany(processInstanceId: string): Promise<FolyamatPeldany | null> {
  try {
    return await hiv<FolyamatPeldany>(`runtime/process-instances/${processInstanceId}`)
  } catch (e) {
    if (e instanceof FlowableHiba && e.status === 404) return null
    throw e
  }
}

export async function folyamatTorles(processInstanceId: string, ok: string): Promise<void> {
  await hiv<void>(`runtime/process-instances/${processInstanceId}?deleteReason=${encodeURIComponent(ok)}`, {
    method: 'DELETE',
  })
}

export async function folyamatValtozok(processInstanceId: string): Promise<Record<string, unknown>> {
  const lista = await hiv<FlowableVaria[]>(`runtime/process-instances/${processInstanceId}/variables`)
  return Object.fromEntries(lista.map((v) => [v.name, v.value]))
}

/** A folyamat aktív user taskjai. */
export async function aktivFeladatok(processInstanceId: string): Promise<Feladat[]> {
  const r = await hiv<Lista<Feladat>>(`runtime/tasks?processInstanceId=${encodeURIComponent(processInstanceId)}`)
  return r.data
}

/** Az adott user task, ha éppen aktív; különben null. */
export async function feladatKeres(processInstanceId: string, taskDefinitionKey: string): Promise<Feladat | null> {
  const r = await hiv<Lista<Feladat>>(
    `runtime/tasks?processInstanceId=${encodeURIComponent(processInstanceId)}&taskDefinitionKey=${encodeURIComponent(taskDefinitionKey)}`
  )
  return r.data[0] ?? null
}

export async function feladatLezaras(taskId: string, valtozok: Record<string, unknown> = {}): Promise<void> {
  await hiv<void>(`runtime/tasks/${taskId}`, {
    method: 'POST',
    ...json({ action: 'complete', variables: variak(valtozok) }),
  })
}

/**
 * Üzenet küldése egy futó folyamatnak: az üzenetre feliratkozott execution megkeresése,
 * majd messageEventReceived. false, ha a folyamat éppen nem vár ilyen üzenetre.
 */
export async function uzenetKuldes(
  processInstanceId: string,
  uzenet: string,
  valtozok: Record<string, unknown> = {}
): Promise<boolean> {
  const r = await hiv<Lista<{ id: string }>>(
    `runtime/executions?processInstanceId=${encodeURIComponent(processInstanceId)}&messageEventSubscriptionName=${encodeURIComponent(uzenet)}`
  )
  const execution = r.data[0]
  if (!execution) return false
  await hiv<void>(`runtime/executions/${execution.id}`, {
    method: 'PUT',
    ...json({ action: 'messageEventReceived', messageName: uzenet, variables: variak(valtozok) }),
  })
  return true
}

export async function motorVerzio(): Promise<string> {
  const r = await hiv<{ version: string }>('management/engine')
  return r.version
}
