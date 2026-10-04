create table if not exists users (
  id text primary key,
  username text not null unique,
  name text not null,
  password_hash text not null,
  role text not null,
  status text not null default 'active',
  failed_attempts integer not null default 0,
  locked_until bigint
);

create table if not exists departments (
  id text primary key,
  name text not null,
  parent_id text,
  quota_formal integer not null default 0,
  quota_agent integer not null default 0,
  source text not null default 'import',
  version integer not null default 1
);

create table if not exists department_closure (
  ancestor_id text not null,
  descendant_id text not null,
  depth integer not null,
  primary key (ancestor_id, descendant_id)
);

create table if not exists user_departments (
  user_id text not null,
  department_id text not null,
  primary key (user_id, department_id)
);

create table if not exists people (
  id text primary key,
  employee_no text not null,
  name text not null,
  department_id text not null,
  title text not null,
  grade text not null,
  manager_id text,
  is_manager boolean not null default false,
  employment_type text not null,
  city text not null default '',
  hire_date text,
  source text not null default 'import',
  version integer not null default 1
);

create table if not exists movements (
  id text primary key,
  kind text not null,
  person_name text not null,
  employee_no text not null default '',
  department_id text not null,
  from_department_id text,
  to_department_id text,
  title text not null default '',
  grade text not null default '',
  employment_type text not null default '正式',
  effective_date text not null,
  comp_mark text,
  hire_date text,
  city text,
  agent_type text,
  instance_delta integer,
  seat_monthly integer,
  compute_monthly integer,
  one_off integer,
  source text not null default 'import',
  version integer not null default 1
);

create table if not exists agents (
  id text primary key,
  name text not null,
  agent_type text not null,
  department_id text not null,
  instances integer not null,
  seat_monthly integer not null,
  compute_monthly integer not null,
  source text not null default 'import',
  version integer not null default 1
);

create table if not exists grade_bands (
  grade text primary key,
  annual_cost integer not null,
  year integer not null,
  source text not null default 'manual',
  version integer not null default 1
);

create table if not exists agent_prices (
  agent_type text primary key,
  seat_monthly integer not null,
  compute_monthly integer not null,
  one_off integer not null default 0,
  source text not null default 'manual',
  version integer not null default 1
);

create table if not exists city_wages (
  city text primary key,
  year integer not null,
  monthly_avg integer not null,
  source_note text not null default '',
  updated_on text not null default ''
);

create table if not exists other_rates (
  employment_type text primary key,
  annual_cost integer not null
);

create table if not exists other_seats (
  id text primary key,
  department_id text not null,
  employment_type text not null,
  headcount integer not null
);

create table if not exists department_budgets (
  department_id text primary key,
  year integer not null,
  amount integer not null,
  source text not null default 'manual',
  version integer not null default 1
);

create table if not exists plan_settings (
  id integer primary key,
  year integer not null,
  as_of text not null,
  company_budget integer not null,
  one_off_budget integer,
  exact_for_leaders boolean not null default false,
  data_version text not null,
  source text not null default 'import'
);

create table if not exists tenure_averages (
  department_id text not null,
  grade text not null,
  average_months real not null,
  headcount integer not null,
  primary key (department_id, grade)
);

create table if not exists scenarios (
  id text primary key,
  name text not null,
  source text not null default 'manual',
  version integer not null default 1,
  note text not null default ''
);

create table if not exists access_logs (
  id integer generated always as identity primary key,
  user_id text not null,
  user_name text not null,
  department_id text not null,
  department_name text not null,
  created_at bigint not null
);

create table if not exists toggle_logs (
  id integer generated always as identity primary key,
  user_id text not null,
  user_name text not null,
  enabled boolean not null,
  created_at bigint not null
);

create table if not exists operation_logs (
  id integer generated always as identity primary key,
  user_id text not null,
  user_name text not null,
  action text not null,
  detail text not null,
  created_at bigint not null
);

create table if not exists ai_conclusions (
  department_id text not null,
  data_version text not null,
  sentence text not null,
  origin text not null,
  created_at bigint not null,
  primary key (department_id, data_version)
);

create index if not exists access_logs_created_at_idx on access_logs (created_at);
create index if not exists operation_logs_created_at_idx on operation_logs (created_at);
