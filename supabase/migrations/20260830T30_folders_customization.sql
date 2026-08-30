-- Projects customize like the reference's (owner 2026-08-30): an icon, a colour, and standing
-- instructions that ride every turn of every canvas filed in the project.
-- All three nullable - null means the default folder look and no extra instructions.
--
-- Applied to project qyjmivntajbigjswhahb on 2026-08-30 (folders_customization).
alter table public.folders
  add column if not exists icon text,
  add column if not exists color text,
  add column if not exists instructions text;

-- Caps, not formats: the icon is a codicon name the client validates against its own preset list,
-- the colour is a hex the client picks from presets, instructions are prompt text with a budget.
alter table public.folders drop constraint if exists folders_icon_len;
alter table public.folders add constraint folders_icon_len
  check (icon is null or char_length(icon) <= 32);
alter table public.folders drop constraint if exists folders_color_shape;
alter table public.folders add constraint folders_color_shape
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
alter table public.folders drop constraint if exists folders_instructions_len;
alter table public.folders add constraint folders_instructions_len
  check (instructions is null or char_length(instructions) <= 4000);
