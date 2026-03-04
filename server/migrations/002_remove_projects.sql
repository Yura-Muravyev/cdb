-- Remove projects entity: firmware becomes top-level

-- Drop foreign key and column from firmware
ALTER TABLE firmware DROP CONSTRAINT firmware_project_id_name_key;
ALTER TABLE firmware DROP COLUMN project_id;

-- Add unique constraint on firmware name (was unique per project, now globally unique)
ALTER TABLE firmware ADD CONSTRAINT firmware_name_key UNIQUE (name);

-- Drop projects table
DROP TABLE projects;
