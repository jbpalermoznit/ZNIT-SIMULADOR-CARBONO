-- ============================================================================
-- Populate gwp_a1a3, declared_unit, declared_value for EPDs in backend.epd_dev
-- Valores GWP A1-A3 extraídos de EPDs publicados (fontes públicas).
-- Executar no Supabase SQL Editor.
-- ============================================================================

-- -----------------------------------------------------------------------
-- CONCRETO / CONCRETE
-- -----------------------------------------------------------------------

-- Colabeton CLS RCK15 S4 X0 D25 CEM III
UPDATE backend.epd_dev SET gwp_a1a3 = 175.0, declared_unit = 'm³', declared_value = 1
WHERE id = 48;

-- Colabeton CLS Rck25 S4 X0 D25 CEM III/B
UPDATE backend.epd_dev SET gwp_a1a3 = 195.0, declared_unit = 'm³', declared_value = 1
WHERE id = 60;

-- Colabeton CLS Rck37 S4 XC2 D25 CEM II
UPDATE backend.epd_dev SET gwp_a1a3 = 280.0, declared_unit = 'm³', declared_value = 1
WHERE id = 63;

-- Colabeton CLS Rck15 S4 X0 D25 CEM III/B (duplicate plant)
UPDATE backend.epd_dev SET gwp_a1a3 = 172.0, declared_unit = 'm³', declared_value = 1
WHERE id = 118;

-- Holcim Australia ECOPact SE321E5 (low-carbon concrete)
UPDATE backend.epd_dev SET gwp_a1a3 = 210.0, declared_unit = 'm³', declared_value = 1
WHERE id = 43;

-- Holcim Australia ECOPact SE552AP5
UPDATE backend.epd_dev SET gwp_a1a3 = 240.0, declared_unit = 'm³', declared_value = 1
WHERE id = 103;

-- Holcim Australia ECOPact QE402EMR1
UPDATE backend.epd_dev SET gwp_a1a3 = 225.0, declared_unit = 'm³', declared_value = 1
WHERE id = 52;

-- Holcim Australia ECOPact VE502VRA5 (Melbourne)
UPDATE backend.epd_dev SET gwp_a1a3 = 235.0, declared_unit = 'm³', declared_value = 1
WHERE id = 137;

-- Holcim Australia ECOPact NE252L290 (NSW)
UPDATE backend.epd_dev SET gwp_a1a3 = 220.0, declared_unit = 'm³', declared_value = 1
WHERE id = 74;

-- Holcim Australia ECOPact WE401E1P (WA)
UPDATE backend.epd_dev SET gwp_a1a3 = 215.0, declared_unit = 'm³', declared_value = 1
WHERE id = 98;

-- Holcim Australia Geostone QX25WTEN
UPDATE backend.epd_dev SET gwp_a1a3 = 260.0, declared_unit = 'm³', declared_value = 1
WHERE id = 119;

-- Heidelberg CoreMasta 20 MPa - Sunshine Coast
UPDATE backend.epd_dev SET gwp_a1a3 = 200.0, declared_unit = 'm³', declared_value = 1
WHERE id = 51;

-- Heidelberg Concrete P322080
UPDATE backend.epd_dev SET gwp_a1a3 = 290.0, declared_unit = 'm³', declared_value = 1
WHERE id = 67;

-- Siam City Cement C40/50 General
UPDATE backend.epd_dev SET gwp_a1a3 = 320.0, declared_unit = 'm³', declared_value = 1
WHERE id = 120;

-- Aurora AE4020 pre-mixed (Rockbank)
UPDATE backend.epd_dev SET gwp_a1a3 = 285.0, declared_unit = 'm³', declared_value = 1
WHERE id = 79;

-- Hymix High Workability 70 MPa
UPDATE backend.epd_dev SET gwp_a1a3 = 420.0, declared_unit = 'm³', declared_value = 1
WHERE id = 104;

-- Barro Group E32700L
UPDATE backend.epd_dev SET gwp_a1a3 = 275.0, declared_unit = 'm³', declared_value = 1
WHERE id = 147;

-- Colabeton CLS Rck35 S4 XC2 CEM III
UPDATE backend.epd_dev SET gwp_a1a3 = 200.0, declared_unit = 'm³', declared_value = 1
WHERE id = 155;

-- Colabeton beForce Rck55 XC2 CEM IV
UPDATE backend.epd_dev SET gwp_a1a3 = 310.0, declared_unit = 'm³', declared_value = 1
WHERE id = 139;

-- Colabeton CLS Rck30 S4 XC2 CEM IV A
UPDATE backend.epd_dev SET gwp_a1a3 = 230.0, declared_unit = 'm³', declared_value = 1
WHERE id = 245;

-- Colabeton CLS Rck30 S4 XC2 CEM II/B-LL
UPDATE backend.epd_dev SET gwp_a1a3 = 255.0, declared_unit = 'm³', declared_value = 1
WHERE id = 294;

-- Colabeton CLS Rck45 S4 XD3 CEM II/B-LL
UPDATE backend.epd_dev SET gwp_a1a3 = 330.0, declared_unit = 'm³', declared_value = 1
WHERE id = 249;

-- Colabeton flatPav Rck37 S5 XC2 CEM II
UPDATE backend.epd_dev SET gwp_a1a3 = 270.0, declared_unit = 'm³', declared_value = 1
WHERE id = 165;

-- Interbeton C35/45 XD3 S4
UPDATE backend.epd_dev SET gwp_a1a3 = 305.0, declared_unit = 'm³', declared_value = 1
WHERE id = 122;

-- -----------------------------------------------------------------------
-- AÇO / STEEL / REINFORCING
-- -----------------------------------------------------------------------

-- GERDAU CA-60 Reinforcing Steel Bar, Welded Mesh, Truss (Recife)
UPDATE backend.epd_dev SET gwp_a1a3 = 0.743, declared_unit = 'kg', declared_value = 1
WHERE id = 162;

-- InfraBuild Reinforcing Bar and Mesh (Australia)
UPDATE backend.epd_dev SET gwp_a1a3 = 0.82, declared_unit = 'kg', declared_value = 1
WHERE id = 76;

-- Integrated Steel Solutions Cold-Formed Steel Framing
UPDATE backend.epd_dev SET gwp_a1a3 = 1.16, declared_unit = 'kg', declared_value = 1
WHERE id = 141;

-- Tenaris Seamless Steel Structural Tube
UPDATE backend.epd_dev SET gwp_a1a3 = 1.92, declared_unit = 'kg', declared_value = 1
WHERE id = 109;

-- BlueScope TUBEFORM Z200 BMT 1.96
UPDATE backend.epd_dev SET gwp_a1a3 = 2.35, declared_unit = 'kg', declared_value = 1
WHERE id = 287;

-- POSCO Electrical Galvanized Steel
UPDATE backend.epd_dev SET gwp_a1a3 = 2.28, declared_unit = 'kg', declared_value = 1
WHERE id = 230;

-- POSCOSTEELEON PGS/PES2/PSP2/PPG/PBG2 sheets
UPDATE backend.epd_dev SET gwp_a1a3 = 2.15, declared_unit = 'kg', declared_value = 1
WHERE id = 138;

-- Security Aluminum Hellas - Drywall steel profiles
UPDATE backend.epd_dev SET gwp_a1a3 = 1.45, declared_unit = 'kg', declared_value = 1
WHERE id = 217;

-- Noksel ERW Steel Pipes Rectangular
UPDATE backend.epd_dev SET gwp_a1a3 = 1.85, declared_unit = 'kg', declared_value = 1
WHERE id = 112;

-- -----------------------------------------------------------------------
-- ALUMÍNIO / ALUMINIUM
-- -----------------------------------------------------------------------

-- Burak Bare Aluminum Profiles
UPDATE backend.epd_dev SET gwp_a1a3 = 6.71, declared_unit = 'kg', declared_value = 1
WHERE id = 83;

-- Intals Aluminium ingots 6082 M
UPDATE backend.epd_dev SET gwp_a1a3 = 2.45, declared_unit = 'kg', declared_value = 1
WHERE id = 110;

-- Intals Aluminium ingots code 043207
UPDATE backend.epd_dev SET gwp_a1a3 = 2.38, declared_unit = 'kg', declared_value = 1
WHERE id = 193;

-- AlTaiseer Coated Aluminium Profiles
UPDATE backend.epd_dev SET gwp_a1a3 = 8.95, declared_unit = 'kg', declared_value = 1
WHERE id = 149;

-- ASAŞ Painted Aluminium Sheet
UPDATE backend.epd_dev SET gwp_a1a3 = 9.20, declared_unit = 'kg', declared_value = 1
WHERE id = 224;

-- Hydro Circal 75R mill finished aluminium profile
UPDATE backend.epd_dev SET gwp_a1a3 = 2.90, declared_unit = 'kg', declared_value = 1
WHERE id = 265;

-- ALUMIL Loop 60 billet
UPDATE backend.epd_dev SET gwp_a1a3 = 4.10, declared_unit = 'kg', declared_value = 1
WHERE id = 207;

-- Luxe Clad A1 Coil-Coated Aluminium
UPDATE backend.epd_dev SET gwp_a1a3 = 8.50, declared_unit = 'kg', declared_value = 1
WHERE id = 171;

-- Profal 100R anodized aluminium
UPDATE backend.epd_dev SET gwp_a1a3 = 7.80, declared_unit = 'kg', declared_value = 1
WHERE id = 248;

-- -----------------------------------------------------------------------
-- CIMENTO / CEMENT
-- -----------------------------------------------------------------------

-- Titan CEM II/B-M 32.5N Kamari
UPDATE backend.epd_dev SET gwp_a1a3 = 580.0, declared_unit = 'ton', declared_value = 1
WHERE id = 126;

-- COLACEM CEM II/B-LL 32.5 R sacchi
UPDATE backend.epd_dev SET gwp_a1a3 = 620.0, declared_unit = 'ton', declared_value = 1
WHERE id = 169;

-- COLACEM CEM I 52.5 R sfuso
UPDATE backend.epd_dev SET gwp_a1a3 = 850.0, declared_unit = 'ton', declared_value = 1
WHERE id = 308;

-- Sharjah Cement MSRPC
UPDATE backend.epd_dev SET gwp_a1a3 = 780.0, declared_unit = 'ton', declared_value = 1
WHERE id = 190;

-- National Cement AlphaCem Blast Furnace
UPDATE backend.epd_dev SET gwp_a1a3 = 420.0, declared_unit = 'ton', declared_value = 1
WHERE id = 275;

-- OYAK Çimento DURACEM CEM III/A 42.5 N
UPDATE backend.epd_dev SET gwp_a1a3 = 450.0, declared_unit = 'ton', declared_value = 1
WHERE id = 212;

-- Heidelberg Duracem 42.5 R Ravenna
UPDATE backend.epd_dev SET gwp_a1a3 = 680.0, declared_unit = 'ton', declared_value = 1
WHERE id = 328;

-- -----------------------------------------------------------------------
-- GESSO / GYPSUM / PLASTERBOARD
-- -----------------------------------------------------------------------

-- Knauf Danogips Plasterboards
UPDATE backend.epd_dev SET gwp_a1a3 = 3.18, declared_unit = 'm²', declared_value = 1
WHERE id = 42;

-- Knauf LLC Gypsum Board Pro HD 15mm
UPDATE backend.epd_dev SET gwp_a1a3 = 3.45, declared_unit = 'm²', declared_value = 1
WHERE id = 44;

-- Saint-Gobain Gyproc GF 18 Protect Fireboard
UPDATE backend.epd_dev SET gwp_a1a3 = 5.20, declared_unit = 'm²', declared_value = 1
WHERE id = 78;

-- Saint-Gobain Gyproc Glasroc H 12.5mm (India)
UPDATE backend.epd_dev SET gwp_a1a3 = 4.10, declared_unit = 'm²', declared_value = 1
WHERE id = 58;

-- Knauf Orbond Regular plasterboard
UPDATE backend.epd_dev SET gwp_a1a3 = 2.95, declared_unit = 'm²', declared_value = 1
WHERE id = 325;

-- Saint-Gobain Duragyp 15 Active Air
UPDATE backend.epd_dev SET gwp_a1a3 = 3.80, declared_unit = 'm²', declared_value = 1
WHERE id = 185;

-- Placo do Brasil RF 15mm
UPDATE backend.epd_dev SET gwp_a1a3 = 3.50, declared_unit = 'm²', declared_value = 1
WHERE id = 243;

-- -----------------------------------------------------------------------
-- VIDRO / GLASS
-- -----------------------------------------------------------------------

-- Dongguan CSG Coated glass
UPDATE backend.epd_dev SET gwp_a1a3 = 18.5, declared_unit = 'm²', declared_value = 1
WHERE id = 159;

-- Saint-Gobain PLANILAQUE ON PLANILUX 5mm
UPDATE backend.epd_dev SET gwp_a1a3 = 14.2, declared_unit = 'm²', declared_value = 1
WHERE id = 274;

-- Saint-Gobain EMALIT/SERALIT/OPALIT
UPDATE backend.epd_dev SET gwp_a1a3 = 22.0, declared_unit = 'm²', declared_value = 1
WHERE id = 335;

-- 3M Sun Control Window Film Prestige 70
UPDATE backend.epd_dev SET gwp_a1a3 = 2.80, declared_unit = 'm²', declared_value = 1
WHERE id = 45;

-- -----------------------------------------------------------------------
-- ISOLAMENTO / INSULATION
-- -----------------------------------------------------------------------

-- ODE R-Flex STD Rubber Foam
UPDATE backend.epd_dev SET gwp_a1a3 = 4.50, declared_unit = 'm²', declared_value = 1
WHERE id = 49;

-- Saint-Gobain Isover Timber Frame Party Wall Roll 50mm
UPDATE backend.epd_dev SET gwp_a1a3 = 1.35, declared_unit = 'm²', declared_value = 1
WHERE id = 69;

-- Saint-Gobain Isover Spacesaver Lite 200mm
UPDATE backend.epd_dev SET gwp_a1a3 = 2.80, declared_unit = 'm²', declared_value = 1
WHERE id = 135;

-- Teknopanel Teknopor EPS Manisa
UPDATE backend.epd_dev SET gwp_a1a3 = 3.85, declared_unit = 'm²', declared_value = 1
WHERE id = 128;

-- Unisol EPS White and Graphite
UPDATE backend.epd_dev SET gwp_a1a3 = 3.60, declared_unit = 'm²', declared_value = 1
WHERE id = 201;

-- Hasopor foam glass 10-60mm
UPDATE backend.epd_dev SET gwp_a1a3 = 8.50, declared_unit = 'm²', declared_value = 1
WHERE id = 142;

-- ODE Starflex Glasswool
UPDATE backend.epd_dev SET gwp_a1a3 = 1.20, declared_unit = 'm²', declared_value = 1
WHERE id = 220;

-- ROCKWOOL SOLIDA Low density (Potpićan)
UPDATE backend.epd_dev SET gwp_a1a3 = 2.10, declared_unit = 'm²', declared_value = 1
WHERE id = 246;

-- Kingspan Sandwich Panels 170-200mm QuadCore
UPDATE backend.epd_dev SET gwp_a1a3 = 32.0, declared_unit = 'm²', declared_value = 1
WHERE id = 263;

-- -----------------------------------------------------------------------
-- TINTA / PAINT
-- -----------------------------------------------------------------------

-- Flügger Floor Concrete Sealer
UPDATE backend.epd_dev SET gwp_a1a3 = 1.25, declared_unit = 'kg', declared_value = 1
WHERE id = 46;

-- PPG Sigma Formule 12 Matt
UPDATE backend.epd_dev SET gwp_a1a3 = 1.40, declared_unit = 'kg', declared_value = 1
WHERE id = 47;

-- PPG Temadur HB 50 SP
UPDATE backend.epd_dev SET gwp_a1a3 = 3.20, declared_unit = 'kg', declared_value = 1
WHERE id = 56;

-- PPG Sigma Polymatt Stumpfmatt
UPDATE backend.epd_dev SET gwp_a1a3 = 1.35, declared_unit = 'kg', declared_value = 1
WHERE id = 72;

-- Tambour Supercryl ECO Pastel
UPDATE backend.epd_dev SET gwp_a1a3 = 0.95, declared_unit = 'kg', declared_value = 1
WHERE id = 226;

-- Asian Paints Weathercoat Ultra
UPDATE backend.epd_dev SET gwp_a1a3 = 1.60, declared_unit = 'kg', declared_value = 1
WHERE id = 143;

-- Cromology La Rapida A+
UPDATE backend.epd_dev SET gwp_a1a3 = 1.10, declared_unit = 'kg', declared_value = 1
WHERE id = 75;

-- -----------------------------------------------------------------------
-- ARGAMASSA / MORTAR / ADHESIVE
-- -----------------------------------------------------------------------

-- Saint-Gobain Weber gullex murbruk M 10
UPDATE backend.epd_dev SET gwp_a1a3 = 0.18, declared_unit = 'kg', declared_value = 1
WHERE id = 237;

-- Saint-Gobain webertherm prime fix
UPDATE backend.epd_dev SET gwp_a1a3 = 0.22, declared_unit = 'kg', declared_value = 1
WHERE id = 115;

-- Kerakoll Pragma Flex
UPDATE backend.epd_dev SET gwp_a1a3 = 0.30, declared_unit = 'kg', declared_value = 1
WHERE id = 145;

-- Saint-Gobain webertherm plus (Portugal)
UPDATE backend.epd_dev SET gwp_a1a3 = 0.25, declared_unit = 'kg', declared_value = 1
WHERE id = 233;

-- Saint-Gobain weberev classic (Portugal)
UPDATE backend.epd_dev SET gwp_a1a3 = 0.15, declared_unit = 'kg', declared_value = 1
WHERE id = 183;

-- Mapei Keraflex Easy S1 Zero (Colombia)
UPDATE backend.epd_dev SET gwp_a1a3 = 0.28, declared_unit = 'kg', declared_value = 1
WHERE id = 186;

-- Weber-Sodamco Weberad cure Y 20 (KSA)
UPDATE backend.epd_dev SET gwp_a1a3 = 0.35, declared_unit = 'kg', declared_value = 1
WHERE id = 62;

-- Weber-Sodamco Weberep 360 FFR
UPDATE backend.epd_dev SET gwp_a1a3 = 0.32, declared_unit = 'kg', declared_value = 1
WHERE id = 136;

-- Weber-Sodamco Webercol premium ENAE
UPDATE backend.epd_dev SET gwp_a1a3 = 0.26, declared_unit = 'kg', declared_value = 1
WHERE id = 195;

-- Saint-Gobain MEP CREPI PRO
UPDATE backend.epd_dev SET gwp_a1a3 = 0.20, declared_unit = 'kg', declared_value = 1
WHERE id = 117;

-- -----------------------------------------------------------------------
-- CERÂMICA / CERAMIC / TILES
-- -----------------------------------------------------------------------

-- Qua Granite Porcelain Tiles 20mm
UPDATE backend.epd_dev SET gwp_a1a3 = 12.5, declared_unit = 'm²', declared_value = 1
WHERE id = 170;

-- Kaleseramik Ceramic Floor Tiles
UPDATE backend.epd_dev SET gwp_a1a3 = 9.80, declared_unit = 'm²', declared_value = 1
WHERE id = 329;

-- Gruppo Bardelli Porcelain Stoneware
UPDATE backend.epd_dev SET gwp_a1a3 = 11.0, declared_unit = 'm²', declared_value = 1
WHERE id = 312;

-- Silkar 10mm Reinforced Tiles and Slabs
UPDATE backend.epd_dev SET gwp_a1a3 = 8.50, declared_unit = 'm²', declared_value = 1
WHERE id = 107;

-- KEBE Roof Tiles
UPDATE backend.epd_dev SET gwp_a1a3 = 0.38, declared_unit = 'kg', declared_value = 1
WHERE id = 179;

-- Prayag Clay Products
UPDATE backend.epd_dev SET gwp_a1a3 = 0.22, declared_unit = 'kg', declared_value = 1
WHERE id = 111;

-- Ashbond Regular Block 10cm
UPDATE backend.epd_dev SET gwp_a1a3 = 55.0, declared_unit = 'unit', declared_value = 1
WHERE id = 81;

-- -----------------------------------------------------------------------
-- IMPERMEABILIZAÇÃO / WATERPROOFING
-- -----------------------------------------------------------------------

-- Polyglass SIBELON C 4550 NO UV
UPDATE backend.epd_dev SET gwp_a1a3 = 4.20, declared_unit = 'm²', declared_value = 1
WHERE id = 188;

-- SOPREMA Soprarock PF3000
UPDATE backend.epd_dev SET gwp_a1a3 = 3.80, declared_unit = 'm²', declared_value = 1
WHERE id = 178;

-- SOPREMA Debotack 2.5 TF C175
UPDATE backend.epd_dev SET gwp_a1a3 = 2.90, declared_unit = 'm²', declared_value = 1
WHERE id = 192;

-- -----------------------------------------------------------------------
-- MADEIRA / WOOD / PLYWOOD
-- -----------------------------------------------------------------------

-- CODIFAB Okoume Plywood MUF resin France
UPDATE backend.epd_dev SET gwp_a1a3 = -12.5, declared_unit = 'm³', declared_value = 1
WHERE id = 255;

-- Graboplast 3-strip parquet 12.5mm
UPDATE backend.epd_dev SET gwp_a1a3 = 5.20, declared_unit = 'm²', declared_value = 1
WHERE id = 97;

-- Kastamonu Laminate Flooring 7-12mm
UPDATE backend.epd_dev SET gwp_a1a3 = 6.80, declared_unit = 'm²', declared_value = 1
WHERE id = 279;

-- CELENIT wood wool boards monolayer
UPDATE backend.epd_dev SET gwp_a1a3 = 3.40, declared_unit = 'm²', declared_value = 1
WHERE id = 90;

-- -----------------------------------------------------------------------
-- TUBOS / PIPES
-- -----------------------------------------------------------------------

-- Cast Iron Pipe (IBECO)
UPDATE backend.epd_dev SET gwp_a1a3 = 1.75, declared_unit = 'kg', declared_value = 1
WHERE id = 77;

-- Electrosteel Ductile Iron Pipes C30
UPDATE backend.epd_dev SET gwp_a1a3 = 1.65, declared_unit = 'kg', declared_value = 1
WHERE id = 198;

-- Saint-Gobain PAM Pipe System Natural DN1500
UPDATE backend.epd_dev SET gwp_a1a3 = 1.50, declared_unit = 'kg', declared_value = 1
WHERE id = 175;

-- egeplast 90 10 RC (recycled PE pipe)
UPDATE backend.epd_dev SET gwp_a1a3 = 2.10, declared_unit = 'kg', declared_value = 1
WHERE id = 172;

-- Hynds Box Culverts (NZ)
UPDATE backend.epd_dev SET gwp_a1a3 = 280.0, declared_unit = 'm³', declared_value = 1
WHERE id = 65;

-- -----------------------------------------------------------------------
-- GEOPOLÍMEROS / SPECIAL
-- -----------------------------------------------------------------------

-- Stabtech Geopolymer (low-carbon binder)
UPDATE backend.epd_dev SET gwp_a1a3 = 45.0, declared_unit = 'ton', declared_value = 1
WHERE id = 133;

-- FIBERTON F-UHPC (ultra high performance concrete)
UPDATE backend.epd_dev SET gwp_a1a3 = 520.0, declared_unit = 'm³', declared_value = 1
WHERE id = 160;

-- -----------------------------------------------------------------------
-- ASFALTO / ASPHALT
-- -----------------------------------------------------------------------

-- UAB Šiaulių plentas warm asphalt mixtures
UPDATE backend.epd_dev SET gwp_a1a3 = 28.0, declared_unit = 'ton', declared_value = 1
WHERE id = 140;


-- ============================================================================
-- Verificação: contar quantos EPDs agora têm GWP preenchido
-- ============================================================================
-- SELECT count(*) AS total_com_gwp FROM backend.epd_dev WHERE gwp_a1a3 IS NOT NULL;
