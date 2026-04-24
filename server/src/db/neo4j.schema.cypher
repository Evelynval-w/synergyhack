CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

CREATE CONSTRAINT skill_name_unique IF NOT EXISTS
FOR (s:Skill) REQUIRE s.name IS UNIQUE;

CREATE CONSTRAINT team_id_unique IF NOT EXISTS
FOR (t:Team) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT hackathon_id_unique IF NOT EXISTS
FOR (h:Hackathon) REQUIRE h.id IS UNIQUE;

CREATE CONSTRAINT role_name_unique IF NOT EXISTS
FOR (r:Role) REQUIRE r.name IS UNIQUE;

CREATE CONSTRAINT project_id_unique IF NOT EXISTS
FOR (p:Project) REQUIRE p.id IS UNIQUE;

CREATE INDEX skill_category_idx IF NOT EXISTS
FOR (s:Skill) ON (s.category);
