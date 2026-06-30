-- ============================================================
-- Seed de aeroportos — PENDENTE APROVAÇÃO DO USUÁRIO
-- ============================================================
-- Este arquivo NÃO foi executado ainda.
-- Para executar, aprovação explícita é necessária.
--
-- Instrução de execução (após aprovação):
--   via Supabase MCP execute_sql  OU  Supabase Dashboard > SQL Editor
--
-- O script usa INSERT … ON CONFLICT (iata) DO UPDATE
-- para que seja idempotente (pode ser re-executado sem duplicar).
-- GRU e MIA já existem — serão atualizados, não duplicados.
-- ============================================================

INSERT INTO aeroportos (iata, nome, cidade, pais, timezone) VALUES

-- ── BRASIL ────────────────────────────────────────────────────
-- São Paulo
('GRU', 'Aeroporto Internacional de Guarulhos',   'Guarulhos',       'BR', 'America/Sao_Paulo'),
('CGH', 'Aeroporto de Congonhas',                  'São Paulo',       'BR', 'America/Sao_Paulo'),
('VCP', 'Aeroporto Internacional de Viracopos',    'Campinas',        'BR', 'America/Sao_Paulo'),

-- Rio de Janeiro
('GIG', 'Aeroporto Internacional do Galeão',       'Rio de Janeiro',  'BR', 'America/Sao_Paulo'),
('SDU', 'Aeroporto Santos Dumont',                 'Rio de Janeiro',  'BR', 'America/Sao_Paulo'),

-- Região Sudeste
('CNF', 'Aeroporto Internacional de Confins',      'Belo Horizonte',  'BR', 'America/Sao_Paulo'),
('PLU', 'Aeroporto da Pampulha',                   'Belo Horizonte',  'BR', 'America/Sao_Paulo'),
('VIX', 'Aeroporto de Vitória',                    'Vitória',         'BR', 'America/Sao_Paulo'),

-- Região Sul
('CWB', 'Aeroporto Internacional Afonso Pena',     'Curitiba',        'BR', 'America/Sao_Paulo'),
('FLN', 'Aeroporto Internacional Hercílio Luz',    'Florianópolis',   'BR', 'America/Sao_Paulo'),
('POA', 'Aeroporto Internacional Salgado Filho',   'Porto Alegre',    'BR', 'America/Sao_Paulo'),
('LDB', 'Aeroporto de Londrina',                   'Londrina',        'BR', 'America/Sao_Paulo'),
('MGF', 'Aeroporto de Maringá',                    'Maringá',         'BR', 'America/Sao_Paulo'),
('IGU', 'Aeroporto Internacional de Foz do Iguaçu','Foz do Iguaçu',  'BR', 'America/Sao_Paulo'),

-- Região Centro-Oeste
('BSB', 'Aeroporto Internacional de Brasília',     'Brasília',        'BR', 'America/Sao_Paulo'),
('GYN', 'Aeroporto Santa Genoveva',                'Goiânia',         'BR', 'America/Sao_Paulo'),
('CGR', 'Aeroporto Internacional de Campo Grande', 'Campo Grande',    'BR', 'America/Sao_Paulo'),
('CGB', 'Aeroporto Marechal Rondon',               'Cuiabá',          'BR', 'America/Cuiaba'),

-- Região Nordeste
('SSA', 'Aeroporto Internacional Dep. Luís Eduardo Magalhães', 'Salvador', 'BR', 'America/Bahia'),
('REC', 'Aeroporto Internacional do Recife',       'Recife',          'BR', 'America/Recife'),
('FOR', 'Aeroporto Internacional Pinto Martins',   'Fortaleza',       'BR', 'America/Fortaleza'),
('NAT', 'Aeroporto Internacional de Natal',        'Natal',           'BR', 'America/Fortaleza'),
('JPA', 'Aeroporto Castro Pinto',                  'João Pessoa',     'BR', 'America/Recife'),
('MCZ', 'Aeroporto Internacional de Maceió',       'Maceió',          'BR', 'America/Recife'),
('AJU', 'Aeroporto Santa Maria',                   'Aracaju',         'BR', 'America/Recife'),
('SLZ', 'Aeroporto Internacional de São Luís',     'São Luís',        'BR', 'America/Fortaleza'),
('THE', 'Aeroporto Internacional de Teresina',     'Teresina',        'BR', 'America/Fortaleza'),
('BPS', 'Aeroporto de Porto Seguro',               'Porto Seguro',    'BR', 'America/Bahia'),
('IOS', 'Aeroporto de Ilhéus',                     'Ilhéus',          'BR', 'America/Bahia'),
('JDO', 'Aeroporto Regional de Juazeiro do Norte', 'Juazeiro do Norte','BR','America/Fortaleza'),

-- Região Norte
('MAO', 'Aeroporto Internacional Eduardo Gomes',   'Manaus',          'BR', 'America/Manaus'),
('BEL', 'Aeroporto Internacional Val de Cans',     'Belém',           'BR', 'America/Belem'),
('PVH', 'Aeroporto Internacional de Porto Velho',  'Porto Velho',     'BR', 'America/Porto_Velho'),
('RBR', 'Aeroporto Internacional de Rio Branco',   'Rio Branco',      'BR', 'America/Rio_Branco'),
('MCP', 'Aeroporto Internacional de Macapá',       'Macapá',          'BR', 'America/Belem'),
('PMW', 'Aeroporto de Palmas',                     'Palmas',          'BR', 'America/Araguaina'),
('STM', 'Aeroporto de Santarém',                   'Santarém',        'BR', 'America/Santarem'),
('IMP', 'Aeroporto de Imperatriz',                 'Imperatriz',      'BR', 'America/Fortaleza'),

-- Interior importante
('UDI', 'Aeroporto Ten. Cel. Av. César Bombonato', 'Uberlândia',      'BR', 'America/Sao_Paulo'),
('JOI', 'Aeroporto Lauro Carneiro de Loyola',      'Joinville',       'BR', 'America/Sao_Paulo'),
('NVT', 'Aeroporto Internacional de Navegantes',   'Navegantes',      'BR', 'America/Sao_Paulo'),
('BHZ', 'Aeroporto de Belo Horizonte (genérico)',  'Belo Horizonte',  'BR', 'America/Sao_Paulo'),

-- ── ESTADOS UNIDOS ────────────────────────────────────────────
('MIA', 'Miami International Airport',             'Miami',           'US', 'America/New_York'),
('MCO', 'Orlando International Airport',           'Orlando',         'US', 'America/New_York'),
('FLL', 'Fort Lauderdale-Hollywood International', 'Fort Lauderdale', 'US', 'America/New_York'),
('TPA', 'Tampa International Airport',             'Tampa',           'US', 'America/New_York'),
('JFK', 'John F. Kennedy International Airport',   'Nova York',       'US', 'America/New_York'),
('EWR', 'Newark Liberty International Airport',    'Newark',          'US', 'America/New_York'),
('LGA', 'LaGuardia Airport',                       'Nova York',       'US', 'America/New_York'),
('BOS', 'Logan International Airport',             'Boston',          'US', 'America/New_York'),
('ATL', 'Hartsfield-Jackson Atlanta International','Atlanta',         'US', 'America/New_York'),
('CLT', 'Charlotte Douglas International Airport', 'Charlotte',       'US', 'America/New_York'),
('IAD', 'Dulles International Airport',            'Washington DC',   'US', 'America/New_York'),
('DCA', 'Ronald Reagan Washington National',       'Washington DC',   'US', 'America/New_York'),
('PHL', 'Philadelphia International Airport',      'Philadelphia',    'US', 'America/New_York'),
('ORD', 'O''Hare International Airport',           'Chicago',         'US', 'America/Chicago'),
('MDW', 'Chicago Midway International Airport',    'Chicago',         'US', 'America/Chicago'),
('IAH', 'George Bush Intercontinental Airport',    'Houston',         'US', 'America/Chicago'),
('DAL', 'Dallas Love Field',                       'Dallas',          'US', 'America/Chicago'),
('DFW', 'Dallas/Fort Worth International Airport', 'Dallas',          'US', 'America/Chicago'),
('LAX', 'Los Angeles International Airport',       'Los Angeles',     'US', 'America/Los_Angeles'),
('SFO', 'San Francisco International Airport',     'São Francisco',   'US', 'America/Los_Angeles'),
('LAS', 'Harry Reid International Airport',        'Las Vegas',       'US', 'America/Los_Angeles'),
('PHX', 'Phoenix Sky Harbor International',        'Phoenix',         'US', 'America/Phoenix'),
('SEA', 'Seattle-Tacoma International Airport',    'Seattle',         'US', 'America/Los_Angeles'),
('DEN', 'Denver International Airport',            'Denver',          'US', 'America/Denver'),

-- ── EUROPA ───────────────────────────────────────────────────
('LIS', 'Aeroporto Humberto Delgado',              'Lisboa',          'PT', 'Europe/Lisbon'),
('OPO', 'Aeroporto Francisco de Sá Carneiro',      'Porto',           'PT', 'Europe/Lisbon'),
('MAD', 'Aeroporto Adolfo Suárez Madrid-Barajas',  'Madrid',          'ES', 'Europe/Madrid'),
('BCN', 'Aeroporto de Barcelona-El Prat',          'Barcelona',       'ES', 'Europe/Madrid'),
('LHR', 'London Heathrow Airport',                 'Londres',         'GB', 'Europe/London'),
('LGW', 'London Gatwick Airport',                  'Londres',         'GB', 'Europe/London'),
('CDG', 'Aéroport Charles de Gaulle',              'Paris',           'FR', 'Europe/Paris'),
('ORY', 'Aéroport de Paris-Orly',                  'Paris',           'FR', 'Europe/Paris'),
('FCO', 'Aeroporto di Roma-Fiumicino',             'Roma',            'IT', 'Europe/Rome'),
('MXP', 'Aeroporto di Milano-Malpensa',            'Milão',           'IT', 'Europe/Rome'),
('MRS', 'Marseille Provence Airport',              'Marselha',        'FR', 'Europe/Paris'),
('NCE', 'Côte d''Azur Airport',                    'Nice',            'FR', 'Europe/Paris'),
('AMS', 'Amsterdam Airport Schiphol',              'Amsterdã',        'NL', 'Europe/Amsterdam'),
('FRA', 'Frankfurt Airport',                       'Frankfurt',       'DE', 'Europe/Berlin'),
('MUC', 'Munich Airport',                          'Munique',         'DE', 'Europe/Berlin'),
('ZRH', 'Zurich Airport',                          'Zurique',         'CH', 'Europe/Zurich'),
('VIE', 'Vienna International Airport',            'Viena',           'AT', 'Europe/Vienna'),
('PRG', 'Václav Havel Airport Prague',             'Praga',           'CZ', 'Europe/Prague'),
('DUB', 'Dublin Airport',                          'Dublin',          'IE', 'Europe/Dublin'),
('BRU', 'Brussels Airport',                        'Bruxelas',        'BE', 'Europe/Brussels'),
('CPH', 'Copenhagen Airport',                      'Copenhague',      'DK', 'Europe/Copenhagen'),
('ARN', 'Stockholm Arlanda Airport',               'Estocolmo',       'SE', 'Europe/Stockholm'),
('OSL', 'Oslo Airport',                            'Oslo',            'NO', 'Europe/Oslo'),
('HEL', 'Helsinki-Vantaa Airport',                 'Helsinki',        'FI', 'Europe/Helsinki'),
('ATH', 'Athens International Airport',            'Atenas',          'GR', 'Europe/Athens'),
('IST', 'Istanbul Airport',                        'Istambul',        'TR', 'Europe/Istanbul'),
('SAW', 'Istanbul Sabiha Gökçen Airport',          'Istambul',        'TR', 'Europe/Istanbul'),

-- ── AMÉRICAS ─────────────────────────────────────────────────
('EZE', 'Aeropuerto Internacional Ministro Pistarini','Buenos Aires', 'AR', 'America/Argentina/Buenos_Aires'),
('AEP', 'Aeroparque Jorge Newbery',                'Buenos Aires',    'AR', 'America/Argentina/Buenos_Aires'),
('SCL', 'Aeropuerto Internacional Arturo Merino Benítez','Santiago',  'CL', 'America/Santiago'),
('LIM', 'Aeropuerto Internacional Jorge Chávez',   'Lima',            'PE', 'America/Lima'),
('BOG', 'Aeropuerto Internacional El Dorado',      'Bogotá',          'CO', 'America/Bogota'),
('MVD', 'Aeropuerto Internacional de Carrasco',    'Montevidéu',      'UY', 'America/Montevideo'),
('ASU', 'Aeropuerto Internacional Silvio Pettirossi','Assunção',      'PY', 'America/Asuncion'),
('CUN', 'Aeropuerto Internacional de Cancún',      'Cancún',          'MX', 'America/Cancun'),
('MEX', 'Aeropuerto Internacional Benito Juárez',  'Cidade do México','MX', 'America/Mexico_City'),
-- ── CARIBE / OUTROS ──────────────────────────────────────────
('CUR', 'Curaçao International Airport',           'Willemstad',      'CW', 'America/Curacao'),
('AUA', 'Queen Beatrix International Airport',     'Oranjestad',      'AW', 'America/Aruba'),
('NAS', 'Lynden Pindling International Airport',   'Nassau',          'BS', 'America/Nassau'),
('MBJ', 'Sangster International Airport',          'Montego Bay',     'JM', 'America/Jamaica'),
('POP', 'Aeropuerto Internacional del Cibao',      'Puerto Plata',    'DO', 'America/Santo_Domingo'),
('SDQ', 'Aeropuerto Internacional de Las Américas','Santo Domingo',   'DO', 'America/Santo_Domingo'),

-- ── ORIENTE MÉDIO / ÁSIA / OCEANIA ───────────────────────────
('DXB', 'Dubai International Airport',             'Dubai',           'AE', 'Asia/Dubai'),
('AUH', 'Abu Dhabi International Airport',         'Abu Dhabi',       'AE', 'Asia/Dubai'),
('DOH', 'Hamad International Airport',             'Doha',            'QA', 'Asia/Qatar'),
('NRT', 'Narita International Airport',            'Tóquio',          'JP', 'Asia/Tokyo'),
('HND', 'Tokyo Haneda Airport',                    'Tóquio',          'JP', 'Asia/Tokyo'),
('ICN', 'Incheon International Airport',           'Seul',            'KR', 'Asia/Seoul'),
('HKG', 'Hong Kong International Airport',         'Hong Kong',       'HK', 'Asia/Hong_Kong'),
('SIN', 'Singapore Changi Airport',                'Singapura',       'SG', 'Asia/Singapore'),
('BKK', 'Suvarnabhumi Airport',                    'Bangkok',         'TH', 'Asia/Bangkok'),
('SYD', 'Sydney Kingsford Smith Airport',          'Sydney',          'AU', 'Australia/Sydney'),
('MEL', 'Melbourne Airport',                       'Melbourne',       'AU', 'Australia/Melbourne'),

-- ── ÁFRICA ───────────────────────────────────────────────────
('CPT', 'Cape Town International Airport',         'Cidade do Cabo',  'ZA', 'Africa/Johannesburg'),
('JNB', 'O.R. Tambo International Airport',        'Joanesburgo',     'ZA', 'Africa/Johannesburg'),
('CAI', 'Cairo International Airport',             'Cairo',           'EG', 'Africa/Cairo')

ON CONFLICT (iata) DO UPDATE SET
  nome     = EXCLUDED.nome,
  cidade   = EXCLUDED.cidade,
  pais     = EXCLUDED.pais,
  timezone = EXCLUDED.timezone,
  ativo    = true;

-- Total esperado: ~120 aeroportos inseridos / atualizados
-- Verificar após execução: SELECT COUNT(*) FROM aeroportos;
