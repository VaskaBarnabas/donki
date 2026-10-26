-- 17. fázis: az ágensfutás azonosítója a tool hívások naplójában (az ágens az X-Agens-Futas fejlécben küldi),
-- hogy az ágens saját naplója (agens-db) és az MCP oldali sorok összekapcsolhatók legyenek.
alter table mcp.tool_calls add column if not exists agent_run_id uuid;
create index if not exists tool_calls_agent_run_idx on mcp.tool_calls (agent_run_id) where agent_run_id is not null;
notify pgrst, 'reload schema';
