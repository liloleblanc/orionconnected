# 2,293 airports of the Americas have a name on the boards; 1,055 of them were added by the change that wrote this list

Every airport of North America, Central America, the Caribbean and South America that the boards print by name:
the gate's destination and origin, its map label, the departures and arrivals rows, the belt sign, the companion
app and the destination card. An airport is of the Americas by its clock: a zone of `America/`, or Bermuda, the
Falklands, Galápagos, Easter Island or Hawaii (Greenland's zones are `America/`, so it is in).

- **Name on the boards** is what a departures row prints before the code, in English.
- **In French** is filled only where a French board prints the name otherwise (a country after a comma is
  written in the language on screen, and is listed in English only).
- **+** marks the 1,055 airports named since the boards read the map's table of names
  (`fids-current/js/earth-places.js`, from OurAirports, public domain). Before that they printed their
  three-letter code: a gate to Río Hato read "Rih". The other 1,238 are named by the board's own tables
  (`CITY` and `CITY_FR` in `fids-current/js/fids-core.js`).
- Where a name is another place's too, it is printed with its state, province or country, as the map under the
  rows prints it ("London, KY", "Valencia, Venezuela"). A city's second airport takes the city's name.

This file is written by `node scripts/names/americas-list.js` from the board's own code and tables, and
`tests/americas-airport-names.test.js` fails when the two differ. 55 countries and territories, sorted by country,
then by name.

| Code | Name on the boards | In French | Country or territory | |
|---|---|---|---|---|
| AXA | Anguilla |  | Anguilla |  |
| ANU | Antigua |  | Antigua and Barbuda |  |
| BBQ | Barbuda |  | Antigua and Barbuda | + |
| BHI | Bahía Blanca |  | Argentina |  |
| AEP | Buenos Aires · Aeroparque |  | Argentina |  |
| EZE | Buenos Aires · Ezeiza |  | Argentina |  |
| CTC | Catamarca |  | Argentina |  |
| CRD | Comodoro Rivadavia |  | Argentina |  |
| COC | Concordia |  | Argentina | + |
| COR | Cordoba |  | Argentina |  |
| CNQ | Corrientes |  | Argentina |  |
| UZU | Curuzú Cuatiá |  | Argentina | + |
| CUT | Cutral-Co |  | Argentina | + |
| EHL | El Bolsón |  | Argentina | + |
| FTE | El Calafate |  | Argentina |  |
| EPA | El Palomar |  | Argentina | + |
| EQS | Esquel |  | Argentina |  |
| FMA | Formosa |  | Argentina |  |
| GPO | General Pico |  | Argentina | + |
| GGS | Gobernador Gregores |  | Argentina | + |
| OYA | Goya |  | Argentina | + |
| GHU | Gualeguaychú |  | Argentina | + |
| LPG | La Plata |  | Argentina | + |
| IRJ | La Rioja |  | Argentina |  |
| LHS | Las Heras |  | Argentina |  |
| LGS | Malargüe |  | Argentina | + |
| MDQ | Mar del Plata |  | Argentina |  |
| MDZ | Mendoza |  | Argentina |  |
| RLO | Merlo |  | Argentina | + |
| MCS | Monte Caseros |  | Argentina | + |
| NEC | Necochea |  | Argentina |  |
| NQN | Neuquén |  | Argentina |  |
| ORA | Orán, Argentina |  | Argentina | + |
| PRA | Parana |  | Argentina |  |
| AOL | Paso de los Libres |  | Argentina | + |
| PEH | Pehuajó |  | Argentina | + |
| PMQ | Perito Moreno |  | Argentina |  |
| PSS | Posadas |  | Argentina |  |
| PUD | Puerto Deseado |  | Argentina |  |
| IGR | Puerto Iguazu |  | Argentina |  |
| PMY | Puerto Madryn |  | Argentina |  |
| RZA | Puerto Santa Cruz |  | Argentina | + |
| REL | Rawson |  | Argentina |  |
| RCQ | Reconquista |  | Argentina | + |
| RES | Resistencia |  | Argentina |  |
| RDS | Rincón de los Sauces |  | Argentina | + |
| RCU | Río Cuarto |  | Argentina | + |
| RGL | Rio Gallegos |  | Argentina |  |
| RGA | Rio Grande |  | Argentina |  |
| RYO | Río Turbio |  | Argentina | + |
| ROS | Rosario |  | Argentina |  |
| SLA | Salta |  | Argentina |  |
| OES | San Antonio Oeste |  | Argentina | + |
| BRC | San Carlos de Bariloche |  | Argentina |  |
| UAQ | San Juan |  | Argentina |  |
| ULA | San Julián |  | Argentina | + |
| LUQ | San Luis |  | Argentina |  |
| CPC | San Martín de los Andes |  | Argentina |  |
| TUC | San Miguel de Tucumán |  | Argentina |  |
| AFA | San Rafael |  | Argentina |  |
| JUJ | San Salvador de Jujuy |  | Argentina |  |
| SFN | Santa Fe |  | Argentina |  |
| RSA | Santa Rosa |  | Argentina |  |
| SST | Santa Teresita |  | Argentina |  |
| SDE | Santiago del Estero |  | Argentina |  |
| TDL | Tandil |  | Argentina | + |
| TTG | Tartagal |  | Argentina | + |
| RHD | Termas de Río Hondo |  | Argentina |  |
| OYO | Tres Arroyos |  | Argentina | + |
| USH | Ushuaia |  | Argentina |  |
| VDM | Viedma |  | Argentina |  |
| VDR | Villa Dolores |  | Argentina | + |
| VLG | Villa Gesell |  | Argentina | + |
| VME | Villa Mercedes |  | Argentina | + |
| APZ | Zapala |  | Argentina | + |
| AUA | Aruba |  | Aruba |  |
| TZN | Andros |  | Bahamas |  |
| SAQ | Andros Island |  | Bahamas |  |
| ASD | Andros Town |  | Bahamas |  |
| ATC | Arthur's Town |  | Bahamas |  |
| NSB | Bimini |  | Bahamas | + |
| CXY | Cat Cay |  | Bahamas | + |
| TBI | Cat Island |  | Bahamas |  |
| CCZ | Chub Cay |  | Bahamas |  |
| CRI | Colonel Hill |  | Bahamas |  |
| LGI | Deadman's Cay |  | Bahamas |  |
| DCT | Duncan Town |  | Bahamas | + |
| ELH | Eleuthera |  | Bahamas |  |
| GGT | Exuma |  | Bahamas |  |
| FPO | Freeport |  | Bahamas |  |
| GHB | Governor's Harbour |  | Bahamas |  |
| GHC | Great Harbour Cay |  | Bahamas | + |
| MAY | Mangrove Cay |  | Bahamas | + |
| MHH | Marsh Harbour |  | Bahamas |  |
| IGA | Matthew Town |  | Bahamas |  |
| MYG | Mayaguana |  | Bahamas |  |
| NAS | Nassau |  | Bahamas |  |
| NMC | Normans Cay |  | Bahamas | + |
| RSD | Rock Sound |  | Bahamas |  |
| RCY | Rum Cay |  | Bahamas | + |
| ZSA | San Salvador |  | Bahamas |  |
| BIM | South Bimini |  | Bahamas |  |
| AXP | Spring Point |  | Bahamas |  |
| TYM | Staniel Cay |  | Bahamas | + |
| SML | Stella Maris |  | Bahamas |  |
| TCB | Treasure Cay |  | Bahamas |  |
| BGI | Barbados | Barbade | Barbados |  |
| BZE | Belize City | Belize | Belize |  |
| TZA | Belize City | Belize | Belize | + |
| BGK | Big Creek |  | Belize | + |
| CUK | Caye Caulker |  | Belize | + |
| CYC | Caye Chapel |  | Belize | + |
| CZH | Corozal, Belize |  | Belize | + |
| DGA | Dangriga |  | Belize | + |
| INB | Independence |  | Belize | + |
| ORZ | Orange Walk |  | Belize | + |
| PLJ | Placencia |  | Belize | + |
| PND | Punta Gorda, Belize |  | Belize | + |
| SPR | San Pedro, Belize |  | Belize | + |
| SJX | Sarteneja |  | Belize | + |
| BDA | Bermuda | Bermudes | Bermuda |  |
| BVL | Baures |  | Bolivia |  |
| BJO | Bermejo |  | Bolivia | + |
| CCA | Chimoré |  | Bolivia | + |
| CIJ | Cobija |  | Bolivia |  |
| CBB | Cochabamba |  | Bolivia |  |
| GYA | Guayaramerin | Guayaramerín | Bolivia |  |
| LPB | La Paz |  | Bolivia |  |
| ORU | Oruro |  | Bolivia | + |
| POI | Potosi | Potosí | Bolivia |  |
| PUR | Puerto Rico, Bolivia |  | Bolivia | + |
| PSZ | Puerto Suárez |  | Bolivia | + |
| RIB | Riberalta |  | Bolivia |  |
| RBQ | Rurrenabaque |  | Bolivia | + |
| SBL | Santa Ana del Yacuma |  | Bolivia | + |
| SRZ | Santa Cruz |  | Bolivia |  |
| VVI | Santa Cruz de la Sierra |  | Bolivia |  |
| SRE | Sucre |  | Bolivia |  |
| TJA | Tarija |  | Bolivia |  |
| TDD | Trinidad |  | Bolivia |  |
| UYU | Uyuni |  | Bolivia |  |
| VLM | Villamontes |  | Bolivia | + |
| BYC | Yacuíba |  | Bolivia | + |
| GGF | Almeirim |  | Brazil | + |
| AFL | Alta Floresta |  | Brazil |  |
| ATM | Altamira |  | Brazil |  |
| AJU | Aracaju |  | Brazil |  |
| ARX | Aracati |  | Brazil | + |
| ARU | Araçatuba |  | Brazil |  |
| AUX | Araguaína |  | Brazil |  |
| AQA | Araraquara |  | Brazil |  |
| JAW | Araripina |  | Brazil | + |
| AAX | Araxá |  | Brazil |  |
| AIR | Aripuanã |  | Brazil | + |
| BGX | Bagé |  | Brazil | + |
| BAZ | Barcelos |  | Brazil | + |
| BPG | Barra do Garças |  | Brazil | + |
| BRA | Barreiras |  | Brazil | + |
| BAT | Barretos |  | Brazil | + |
| JTC | Bauru |  | Brazil |  |
| BEL | Belém |  | Brazil |  |
| CNF | Belo Horizonte |  | Brazil |  |
| PLU | Belo Horizonte |  | Brazil | + |
| BVB | Boa Vista |  | Brazil |  |
| PBA | Boipeba |  | Brazil | + |
| LAZ | Bom Jesus da Lapa |  | Brazil | + |
| BYO | Bonito |  | Brazil | + |
| RBB | Borba |  | Brazil | + |
| BSB | Brasília |  | Brazil |  |
| BVS | Breves |  | Brazil | + |
| BZC | Búzios |  | Brazil | + |
| CFB | Cabo Frio |  | Brazil | + |
| OAL | Cacoal |  | Brazil | + |
| CJZ | Cajazeiras |  | Brazil | + |
| CLV | Caldas Novas |  | Brazil | + |
| CPV | Campina Grande |  | Brazil |  |
| VCP | Campinas |  | Brazil |  |
| CGR | Campo Grande |  | Brazil |  |
| CAW | Campos dos Goytacazes |  | Brazil |  |
| CEL | Canela |  | Brazil | + |
| CAF | Carauari |  | Brazil | + |
| CRQ | Caravelas |  | Brazil | + |
| CLN | Carolina |  | Brazil | + |
| CAU | Caruaru |  | Brazil | + |
| CAC | Cascavel |  | Brazil |  |
| CXJ | Caxias do Sul |  | Brazil |  |
| XAP | Chapecó |  | Brazil |  |
| CIZ | Coari |  | Brazil | + |
| CDJ | Conceição do Araguaia |  | Brazil | + |
| EEA | Correia Pinto |  | Brazil | + |
| CMG | Corumbá |  | Brazil |  |
| CCM | Criciúma |  | Brazil |  |
| JJD | Cruz |  | Brazil |  |
| CZS | Cruzeiro do Sul |  | Brazil |  |
| CGB | Cuiabá |  | Brazil |  |
| BFH | Curitiba |  | Brazil | + |
| CWB | Curitiba |  | Brazil |  |
| DIQ | Divinópolis |  | Brazil | + |
| DOU | Dourados |  | Brazil | + |
| FEC | Feira de Santana |  | Brazil |  |
| FEN | Fernando de Noronha |  | Brazil |  |
| FLN | Florianópolis |  | Brazil |  |
| FOR | Fortaleza |  | Brazil |  |
| IGU | Foz do Iguaçu |  | Brazil |  |
| FRC | Franca |  | Brazil | + |
| FBE | Francisco Beltrão |  | Brazil | + |
| QGP | Garanhuns |  | Brazil | + |
| GYN | Goiânia |  | Brazil |  |
| GVR | Governador Valadares |  | Brazil |  |
| GGJ | Guaíra |  | Brazil | + |
| GJM | Guajará-Mirim |  | Brazil | + |
| GNM | Guanambi |  | Brazil | + |
| GUZ | Guarapari |  | Brazil | + |
| GUJ | Guaratinguetá |  | Brazil | + |
| SSZ | Guarujá |  | Brazil | + |
| IOS | Ilhéus |  | Brazil |  |
| IMP | Imperatriz |  | Brazil |  |
| IPN | Ipatinga |  | Brazil |  |
| ITA | Itacoatiara |  | Brazil | + |
| ITB | Itaituba |  | Brazil |  |
| JCR | Jacareacanga |  | Brazil | + |
| JJG | Jaguaruna |  | Brazil | + |
| JPR | Ji-Paraná |  | Brazil | + |
| JPA | João Pessoa |  | Brazil |  |
| JOI | Joinville |  | Brazil |  |
| JDO | Juazeiro do Norte |  | Brazil | + |
| IZA | Juiz de Fora |  | Brazil |  |
| JDF | Juiz de Fora |  | Brazil |  |
| LBR | Lábrea |  | Brazil | + |
| LAJ | Lages |  | Brazil |  |
| LEC | Lençóis |  | Brazil | + |
| LHN | Linhares |  | Brazil | + |
| LIP | Lins |  | Brazil | + |
| LDB | Londrina |  | Brazil |  |
| MEA | Macaé |  | Brazil | + |
| MCP | Macapá |  | Brazil |  |
| MCZ | Maceió |  | Brazil |  |
| MAO | Manaus |  | Brazil |  |
| PLL | Manaus |  | Brazil | + |
| JMA | Manhuaçu |  | Brazil | + |
| MNX | Manicoré |  | Brazil |  |
| MAB | Marabá |  | Brazil |  |
| MII | Marília |  | Brazil |  |
| MGF | Maringá |  | Brazil |  |
| MBZ | Maués |  | Brazil | + |
| MQH | Minaçu |  | Brazil | + |
| MEU | Monte Dourado |  | Brazil | + |
| MOC | Montes Claros |  | Brazil |  |
| MXQ | Morro de São Paulo |  | Brazil | + |
| MVF | Mossoró |  | Brazil |  |
| NAT | Natal |  | Brazil |  |
| NVT | Navegantes |  | Brazil |  |
| OYK | Oiapoque |  | Brazil | + |
| TMT | Oriximiná |  | Brazil |  |
| OIA | Ourilândia do Norte |  | Brazil | + |
| PMW | Palmas |  | Brazil |  |
| PYT | Paracatu |  | Brazil | + |
| JPE | Paragominas |  | Brazil | + |
| CKS | Parauapebas |  | Brazil |  |
| PIN | Parintins |  | Brazil | + |
| PHB | Parnaíba |  | Brazil |  |
| PFB | Passo Fundo |  | Brazil |  |
| PTO | Pato Branco |  | Brazil | + |
| JPO | Patos |  | Brazil | + |
| POJ | Patos de Minas |  | Brazil | + |
| PAV | Paulo Afonso |  | Brazil |  |
| PET | Pelotas |  | Brazil |  |
| PNZ | Petrolina |  | Brazil |  |
| POO | Poços de Caldas |  | Brazil | + |
| PGZ | Ponta Grossa |  | Brazil |  |
| PMG | Ponta Porã |  | Brazil |  |
| POA | Porto Alegre |  | Brazil |  |
| PTQ | Porto de Moz |  | Brazil | + |
| PNB | Porto Nacional |  | Brazil | + |
| BPS | Porto Seguro |  | Brazil |  |
| PVH | Porto Velho |  | Brazil |  |
| PPB | Presidente Prudente |  | Brazil |  |
| REC | Recife |  | Brazil |  |
| RAO | Ribeirão Preto |  | Brazil |  |
| RBR | Rio Branco |  | Brazil |  |
| RRJ | Rio de Janeiro |  | Brazil |  |
| SNZ | Rio de Janeiro |  | Brazil | + |
| GIG | Rio de Janeiro · Galeão |  | Brazil |  |
| SDU | Rio de Janeiro · Santos Dumont | Rio de Janeiro · Santos-Dumont | Brazil |  |
| ROO | Rondonópolis |  | Brazil |  |
| IAL | Salinas, Brazil |  | Brazil | + |
| OPP | Salinópolis |  | Brazil | + |
| SSA | Salvador |  | Brazil |  |
| IRZ | Santa Isabel do Rio Negro |  | Brazil | + |
| RIA | Santa Maria |  | Brazil |  |
| SRA | Santa Rosa, Brazil |  | Brazil | + |
| STM | Santarém |  | Brazil |  |
| GEL | Santo Ângelo |  | Brazil |  |
| SJL | São Gabriel da Cachoeira |  | Brazil |  |
| SJP | São José do Rio Preto |  | Brazil |  |
| SJK | São José dos Campos |  | Brazil |  |
| SLZ | São Luís |  | Brazil |  |
| RTE | São Paulo |  | Brazil | + |
| CGH | São Paulo · Congonhas |  | Brazil |  |
| GRU | São Paulo · Guarulhos |  | Brazil |  |
| JHF | São Roque |  | Brazil | + |
| SET | Serra Talhada |  | Brazil | + |
| OPS | Sinop, Brazil |  | Brazil | + |
| JSO | Sobral |  | Brazil |  |
| SOD | Sorocaba |  | Brazil | + |
| SMT | Sorriso |  | Brazil | + |
| TBT | Tabatinga |  | Brazil |  |
| TGQ | Tangará da Serra |  | Brazil | + |
| TRQ | Tarauacá |  | Brazil | + |
| TFF | Tefé |  | Brazil |  |
| TEC | Telêmaco Borba |  | Brazil | + |
| TFL | Teófilo Otoni |  | Brazil | + |
| THE | Teresina |  | Brazil |  |
| TOW | Toledo, Brazil |  | Brazil | + |
| TJL | Três Lagoas |  | Brazil | + |
| TUR | Tucuruí |  | Brazil |  |
| UBA | Uberaba |  | Brazil |  |
| UDI | Uberlândia |  | Brazil |  |
| UMU | Umuarama |  | Brazil | + |
| UNA | Una |  | Brazil | + |
| UVI | União da Vitória |  | Brazil | + |
| URG | Uruguaiana |  | Brazil |  |
| VAL | Valença |  | Brazil | + |
| VAG | Varginha |  | Brazil | + |
| BVH | Vilhena |  | Brazil |  |
| VIX | Vitória |  | Brazil |  |
| VDC | Vitória da Conquista |  | Brazil |  |
| EIS | Tortola |  | British Virgin Islands |  |
| VIJ | Virgin Gorda |  | British Virgin Islands | + |
| YXX | Abbotsford |  | Canada |  |
| LAK | Aklavik |  | Canada | + |
| AKV | Akulivik |  | Canada |  |
| YLT | Alert |  | Canada | + |
| YAL | Alert Bay |  | Canada | + |
| YTF | Alma |  | Canada |  |
| YEY | Amos |  | Canada | + |
| YAA | Anahim Lake |  | Canada |  |
| YAX | Angling Lake |  | Canada | + |
| YAB | Arctic Bay |  | Canada | + |
| YYW | Armstrong |  | Canada | + |
| YEK | Arviat |  | Canada |  |
| YIB | Atikokan |  | Canada | + |
| YAT | Attawapiskat |  | Canada | + |
| YPJ | Aupaluk |  | Canada | + |
| YBG | Bagotville |  | Canada |  |
| YBC | Baie-Comeau |  | Canada |  |
| YBK | Baker Lake |  | Canada |  |
| YBF | Bamfield |  | Canada | + |
| YLK | Barrie |  | Canada | + |
| ZBF | Bathurst, NB |  | Canada | + |
| XBE | Bearskin Lake |  | Canada | + |
| YXQ | Beaver Creek |  | Canada | + |
| YBW | Bedwell Harbour |  | Canada | + |
| ZEL | Bella Bella |  | Canada |  |
| QBC | Bella Coola |  | Canada | + |
| YBV | Berens River |  | Canada | + |
| YTL | Big Trout Lake |  | Canada | + |
| YBI | Black Tickle |  | Canada | + |
| YBX | Blanc-Sablon |  | Canada | + |
| YDV | Bloodvein River |  | Canada | + |
| YVB | Bonaventure |  | Canada | + |
| YBY | Bonnyville |  | Canada | + |
| YBR | Brandon |  | Canada |  |
| YBT | Brochet |  | Canada | + |
| ZBM | Bromont |  | Canada | + |
| YGN | Broughton Island |  | Canada | + |
| YPZ | Burns Lake |  | Canada | + |
| YDB | Burwash Landing |  | Canada | + |
| YKZ | Buttonville |  | Canada |  |
| YZA | Cache Creek |  | Canada | + |
| YYC | Calgary |  | Canada |  |
| YCB | Cambridge Bay | Baie de Cambridge | Canada |  |
| YBL | Campbell River |  | Canada |  |
| YHH | Campbell River |  | Canada | + |
| YRF | Cartwright |  | Canada | + |
| YCG | Castlegar |  | Canada |  |
| YAC | Cat Lake |  | Canada | + |
| YCE | Centralia |  | Canada | + |
| YLD | Chapleau |  | Canada | + |
| YML | Charlevoix |  | Canada | + |
| YCL | Charlo |  | Canada | + |
| YYG | Charlottetown |  | Canada |  |
| YHG | Charlottetown, NL |  | Canada | + |
| YCS | Chesterfield Inlet |  | Canada | + |
| YCQ | Chetwynd |  | Canada | + |
| YHR | Chevery |  | Canada |  |
| YMT | Chibougamau |  | Canada |  |
| YKU | Chisasibi |  | Canada |  |
| YYQ | Churchill |  | Canada | + |
| ZUM | Churchill Falls |  | Canada | + |
| YCY | Clyde River |  | Canada | + |
| YCN | Cochrane, ON |  | Canada | + |
| YOD | Cold Lake |  | Canada | + |
| YCK | Colville Lake |  | Canada | + |
| YQQ | Comox |  | Canada |  |
| YZS | Coral Harbour |  | Canada | + |
| YCC | Cornwall |  | Canada | + |
| YXC | Cranbrook |  | Canada |  |
| YCR | Cross Lake |  | Canada | + |
| YDN | Dauphin |  | Canada | + |
| YDA | Dawson City |  | Canada |  |
| YDQ | Dawson Creek |  | Canada |  |
| YDL | Dease Lake |  | Canada | + |
| YDF | Deer Lake |  | Canada |  |
| YVZ | Deer Lake, ON |  | Canada | + |
| YWJ | Déline |  | Canada | + |
| YDT | Delta |  | Canada | + |
| YDG | Digby |  | Canada | + |
| YDO | Dolbeau-Saint-Félicien |  | Canada | + |
| YHD | Dryden |  | Canada | + |
| YXR | Earlton |  | Canada | + |
| ZEM | Eastmain River |  | Canada | + |
| YEG | Edmonton |  | Canada |  |
| YET | Edson |  | Canada | + |
| YOA | Ekati |  | Canada | + |
| YEL | Elliot Lake |  | Canada | + |
| YEN | Estevan |  | Canada | + |
| ZFA | Faro, YT |  | Canada | + |
| YFI | Firebag |  | Canada |  |
| YFO | Flin Flon |  | Canada | + |
| ZFD | Fond-du-Lac |  | Canada |  |
| YFE | Forestville |  | Canada | + |
| YFA | Fort Albany |  | Canada | + |
| YPY | Fort Chipewyan |  | Canada |  |
| YAG | Fort Frances |  | Canada |  |
| YGH | Fort Good Hope |  | Canada | + |
| YFH | Fort Hope |  | Canada | + |
| YJF | Fort Liard |  | Canada | + |
| YMM | Fort McMurray |  | Canada |  |
| ZFM | Fort McPherson |  | Canada | + |
| YYE | Fort Nelson |  | Canada |  |
| YFR | Fort Resolution |  | Canada | + |
| YER | Fort Severn |  | Canada | + |
| YFS | Fort Simpson |  | Canada |  |
| YSM | Fort Smith |  | Canada |  |
| YXJ | Fort St John |  | Canada |  |
| YFC | Fredericton |  | Canada |  |
| SYF | Gabriola Island |  | Canada | + |
| YMF | Galiano Island |  | Canada | + |
| YRA | Gamètì |  | Canada | + |
| YQX | Gander |  | Canada |  |
| YGP | Gaspé |  | Canada |  |
| YND | Gatineau |  | Canada | + |
| YGQ | Geraldton, ON |  | Canada | + |
| YGX | Gillam |  | Canada | + |
| YGM | Gimli |  | Canada | + |
| YHK | Gjoa Haven |  | Canada | + |
| YGO | Gods Lake Narrows |  | Canada | + |
| ZGI | Gods River |  | Canada | + |
| YYR | Goose Bay |  | Canada |  |
| YZE | Gore Bay |  | Canada | + |
| ZGF | Grand Forks, BC |  | Canada | + |
| YQU | Grande Prairie |  | Canada |  |
| YQA | Gravenhurst |  | Canada | + |
| YZX | Greenwood, NS |  | Canada | + |
| YGZ | Grise Fiord |  | Canada | + |
| YHT | Haines Junction |  | Canada | + |
| YHZ | Halifax |  | Canada |  |
| YHM | Hamilton |  | Canada |  |
| YGV | Havre-Saint-Pierre |  | Canada | + |
| YHY | Hay River |  | Canada |  |
| YHF | Hearst |  | Canada | + |
| YOJ | High Level |  | Canada |  |
| YHO | Hopedale |  | Canada | + |
| YHN | Hornepayne |  | Canada | + |
| YGT | Igloolik |  | Canada | + |
| ZUC | Ignace |  | Canada | + |
| YGR | Îles-de-la-Madeleine |  | Canada |  |
| ILF | Ilford |  | Canada | + |
| YPH | Inukjuak |  | Canada |  |
| YEV | Inuvik |  | Canada |  |
| YFB | Iqaluit |  | Canada |  |
| YIV | Island Lake |  | Canada | + |
| YIK | Ivujivik |  | Canada |  |
| ZJG | Jenpeg |  | Canada | + |
| YKA | Kamloops |  | Canada |  |
| XGR | Kangiqsualujjuaq |  | Canada |  |
| YWB | Kangiqsujuaq |  | Canada |  |
| YKG | Kangirsuk |  | Canada |  |
| YYU | Kapuskasing |  | Canada | + |
| XKS | Kasabonika |  | Canada | + |
| ZKE | Kashechewan |  | Canada | + |
| KEW | Keewaywin |  | Canada | + |
| YLW | Kelowna |  | Canada |  |
| KES | Kelsey |  | Canada | + |
| YQK | Kenora |  | Canada |  |
| YKJ | Key Lake |  | Canada | + |
| YLC | Kimmirut |  | Canada |  |
| YKD | Kincardine |  | Canada | + |
| YKY | Kindersley |  | Canada | + |
| KIF | Kingfisher Lake |  | Canada | + |
| YGK | Kingston |  | Canada |  |
| YTE | Kinngait |  | Canada | + |
| YKX | Kirkland Lake |  | Canada | + |
| YKF | Kitchener |  | Canada |  |
| YBB | Kugaaruk |  | Canada | + |
| YCO | Kugluktuk |  | Canada |  |
| YVP | Kuujjuaq |  | Canada |  |
| YGW | Kuujjuarapik |  | Canada |  |
| YGL | La Grande |  | Canada |  |
| YAH | La Grande-4 |  | Canada | + |
| ZGS | La Romaine |  | Canada | + |
| YVC | La Ronge |  | Canada | + |
| ZLT | La Tabatière |  | Canada | + |
| XLB | Lac Brochet |  | Canada | + |
| YLY | Langley |  | Canada | + |
| YLH | Lansdowne House |  | Canada | + |
| YLR | Leaf Rapids |  | Canada | + |
| YQL | Lethbridge |  | Canada |  |
| YLL | Lloydminster |  | Canada |  |
| YXU | London |  | Canada |  |
| YSG | Lutselk'e |  | Canada | + |
| YYL | Lynn Lake |  | Canada | + |
| YMN | Makkovik |  | Canada | + |
| YMG | Manitouwadge |  | Canada | + |
| YAQ | Maple Bay |  | Canada | + |
| YSP | Marathon, ON |  | Canada | + |
| YMH | Mary's Harbour |  | Canada | + |
| ZMT | Masset |  | Canada |  |
| YNM | Matagami |  | Canada | + |
| YME | Matane |  | Canada | + |
| YAV | Mayne Island |  | Canada | + |
| YMA | Mayo |  | Canada | + |
| YLJ | Meadow Lake |  | Canada | + |
| YXH | Medicine Hat |  | Canada |  |
| YMX | Mirabel |  | Canada |  |
| YCH | Miramichi |  | Canada |  |
| YQM | Moncton |  | Canada |  |
| YYY | Mont-Joli |  | Canada |  |
| YTM | Mont-Tremblant |  | Canada | + |
| YHU (printed MET) | Montréal · Métropolitain |  | Canada |  |
| YUL | Montréal · Trudeau |  | Canada |  |
| YMJ | Moose Jaw |  | Canada |  |
| YMO | Moosonee |  | Canada |  |
| MSA | Muskrat Dam |  | Canada | + |
| KM8 | Musselwhite |  | Canada |  |
| YMU | Musselwhite |  | Canada |  |
| YDP | Nain |  | Canada | + |
| YQN | Nakina |  | Canada | + |
| YCD | Nanaimo |  | Canada |  |
| ZNA | Nanaimo |  | Canada | + |
| YNA | Natashquan |  | Canada |  |
| YNP | Natuashish |  | Canada | + |
| YUT | Naujaat |  | Canada | + |
| YNS | Nemiscau |  | Canada |  |
| YVQ | Norman Wells |  | Canada |  |
| YQW | North Battleford |  | Canada | + |
| YYB | North Bay |  | Canada |  |
| YNO | North Spirit Lake |  | Canada | + |
| YNE | Norway House |  | Canada | + |
| YOG | Ogoki Post |  | Canada | + |
| YOC | Old Crow |  | Canada |  |
| YOO | Oshawa |  | Canada | + |
| YOW | Ottawa |  | Canada |  |
| YRO | Ottawa |  | Canada | + |
| YOS | Owen Sound |  | Canada | + |
| YOH | Oxford House |  | Canada | + |
| YXP | Pangnirtung |  | Canada | + |
| YPC | Paulatuk |  | Canada | + |
| YPE | Peace River |  | Canada |  |
| YPO | Peawanuck |  | Canada | + |
| YTA | Pembroke |  | Canada | + |
| YYF | Penticton |  | Canada |  |
| YPQ | Peterborough |  | Canada |  |
| YPL | Pickle Lake |  | Canada | + |
| YPM | Pikangikum |  | Canada | + |
| PIW | Pikwitonei |  | Canada | + |
| WPC | Pincher Creek |  | Canada | + |
| YNL | Points North Landing |  | Canada | + |
| YIO | Pond Inlet |  | Canada | + |
| YHP | Poplar Hill |  | Canada | + |
| YZT | Port Hardy |  | Canada |  |
| YPS | Port Hawkesbury |  | Canada | + |
| YHA | Port Hope Simpson |  | Canada | + |
| YMP | Port McNeill |  | Canada | + |
| YPN | Port-Menier |  | Canada | + |
| YPG | Portage la Prairie |  | Canada | + |
| YSO | Postville |  | Canada | + |
| WPL | Powell River |  | Canada | + |
| YPW | Powell River |  | Canada |  |
| YPA | Prince Albert |  | Canada |  |
| YXS | Prince George |  | Canada |  |
| YPR | Prince Rupert |  | Canada |  |
| XPK | Pukatawagan |  | Canada | + |
| YPX | Puvirnituq |  | Canada |  |
| YVM | Qikiqtarjuaq |  | Canada | + |
| XQU | Qualicum Beach |  | Canada |  |
| YQC | Quaqtaq |  | Canada |  |
| YQB | Quebec City | Québec | Canada |  |
| YQZ | Quesnel |  | Canada | + |
| YOP | Rainbow Lake |  | Canada | + |
| YRT | Rankin Inlet |  | Canada |  |
| YQF | Red Deer |  | Canada |  |
| YRL | Red Lake |  | Canada | + |
| YRS | Red Sucker Lake |  | Canada | + |
| YQR | Regina |  | Canada |  |
| YRB | Resolute Bay |  | Canada | + |
| YRV | Revelstoke |  | Canada | + |
| YRG | Rigolet |  | Canada | + |
| YXK | Rimouski |  | Canada | + |
| YRI | Rivière-du-Loup |  | Canada |  |
| YRJ | Roberval |  | Canada |  |
| XRR | Ross River |  | Canada | + |
| ZRJ | Round Lake |  | Canada | + |
| YUY | Rouyn-Noranda |  | Canada |  |
| ZPB | Sachigo Lake |  | Canada | + |
| YSY | Sachs Harbour |  | Canada |  |
| YIF | Saint-Augustin |  | Canada | + |
| YJN | Saint-Jean-sur-Richelieu |  | Canada | + |
| YSJ | Saint John |  | Canada |  |
| YSL | Saint-Léonard |  | Canada | + |
| YZG | Salluit |  | Canada |  |
| YSN | Salmon Arm |  | Canada | + |
| YGG | Salt Spring Island |  | Canada | + |
| YZP | Sandspit |  | Canada |  |
| ZSJ | Sandy Lake |  | Canada | + |
| YSK | Sanikiluaq |  | Canada | + |
| YUX | Sanirajak |  | Canada | + |
| YZR | Sarnia |  | Canada |  |
| YXE | Saskatoon |  | Canada |  |
| YAJ | Saturna Island |  | Canada | + |
| YAM | Sault Ste. Marie | Sault-Sainte-Marie | Canada |  |
| YKL | Schefferville |  | Canada |  |
| YHS | Sechelt |  | Canada | + |
| YZV | Sept-Îles |  | Canada |  |
| ZTM | Shamattawa |  | Canada | + |
| YEM | Sheguiandah |  | Canada | + |
| YSC | Sherbrooke |  | Canada | + |
| YXL | Sioux Lookout |  | Canada |  |
| YZH | Slave Lake |  | Canada | + |
| YYD | Smithers |  | Canada |  |
| YSH | Smiths Falls |  | Canada | + |
| XSI | South Indian Lake |  | Canada | + |
| YAY | St. Anthony |  | Canada |  |
| YCM | St. Catharines |  | Canada | + |
| YYT | St. John's |  | Canada |  |
| YFX | St. Lewis |  | Canada | + |
| YST | St. Theresa Point |  | Canada | + |
| YQS | St Thomas, ON |  | Canada | + |
| ZST | Stewart |  | Canada | + |
| YSF | Stony Rapids |  | Canada | + |
| YIG | Stuart Island |  | Canada | + |
| YSB | Sudbury |  | Canada |  |
| YTG | Sullivan Bay |  | Canada | + |
| SUR | Summer Beaver |  | Canada | + |
| YSU | Summerside |  | Canada | + |
| ZJN | Swan River |  | Canada | + |
| YYN | Swift Current |  | Canada |  |
| YQY | Sydney |  | Canada |  |
| XTL | Tadoule Lake |  | Canada | + |
| YYH | Taloyoak |  | Canada |  |
| YTQ | Tasiujaq |  | Canada | + |
| YXT | Terrace |  | Canada |  |
| YZW | Teslin |  | Canada | + |
| ZTB | Tête-à-la-Baleine |  | Canada | + |
| YQD | The Pas |  | Canada | + |
| YBQ | Thetis Island |  | Canada | + |
| YTD | Thicket Portage |  | Canada | + |
| YTH | Thompson |  | Canada |  |
| YQT | Thunder Bay |  | Canada |  |
| YTS | Timmins |  | Canada |  |
| YAZ | Tofino |  | Canada |  |
| YTP | Tofino |  | Canada | + |
| YTZ | Toronto · Billy Bishop | Toronto · Billy-Bishop | Canada |  |
| YYZ | Toronto · Pearson |  | Canada |  |
| YZZ | Trail |  | Canada |  |
| YTR | Trenton, ON |  | Canada | + |
| YRQ | Trois-Rivières |  | Canada | + |
| ZFN | Tulita |  | Canada | + |
| YHI | Ulukhaktok |  | Canada | + |
| YUD | Umiujaq |  | Canada |  |
| YBE | Uranium City |  | Canada | + |
| YVO | Val-d'Or |  | Canada |  |
| CXH | Vancouver |  | Canada | + |
| YVR | Vancouver |  | Canada |  |
| YVE | Vernon |  | Canada | + |
| YWH | Victoria |  | Canada | + |
| YYJ | Victoria |  | Canada |  |
| YWK | Wabush |  | Canada |  |
| YKQ | Waskaganish |  | Canada |  |
| YQH | Watson Lake |  | Canada | + |
| YXZ | Wawa |  | Canada | + |
| YWP | Webequie |  | Canada | + |
| YFJ | Wekweètì |  | Canada | + |
| YNC | Wemindji |  | Canada | + |
| YXN | Whale Cove |  | Canada | + |
| YLE | Whatì |  | Canada | + |
| YWS | Whistler |  | Canada | + |
| YZU | Whitecourt |  | Canada | + |
| YXY | Whitehorse |  | Canada |  |
| YVV | Wiarton |  | Canada | + |
| YWM | Williams Harbour |  | Canada | + |
| YWL | Williams Lake |  | Canada |  |
| YQG | Windsor |  | Canada |  |
| YWG | Winnipeg |  | Canada |  |
| ZWL | Wollaston Lake |  | Canada | + |
| YWY | Wrigley |  | Canada | + |
| WNN | Wunnumin Lake |  | Canada | + |
| YQI | Yarmouth |  | Canada |  |
| YZF | Yellowknife |  | Canada |  |
| YQV | Yorkton |  | Canada | + |
| BON | Bonaire |  | Caribbean Netherlands |  |
| SAB | Saba |  | Caribbean Netherlands | + |
| EUX | Sint Eustatius |  | Caribbean Netherlands | + |
| CYB | Cayman Brac |  | Cayman Islands |  |
| GCM | Grand Cayman | Grand Caïman | Cayman Islands |  |
| LYB | Little Cayman |  | Cayman Islands | + |
| ANF | Antofagasta |  | Chile |  |
| ARI | Arica |  | Chile |  |
| DPB | Bahía Inútil |  | Chile | + |
| BBA | Balmaceda |  | Chile |  |
| CJC | Calama |  | Chile |  |
| MHC | Castro |  | Chile | + |
| WCH | Chaitén |  | Chile | + |
| CNR | Chañaral |  | Chile | + |
| CCH | Chile Chico |  | Chile | + |
| YAI | Chillán |  | Chile | + |
| LGR | Cochrane, Chile |  | Chile | + |
| CCP | Concepcion |  | Chile |  |
| CPO | Copiapo |  | Chile |  |
| GXQ | Coyhaique |  | Chile | + |
| ESR | El Salvador |  | Chile |  |
| IQQ | Iquique |  | Chile |  |
| IPC | Isla de Pascua |  | Chile |  |
| LSC | La Serena |  | Chile |  |
| ZOS | Osorno |  | Chile |  |
| WPR | Porvenir |  | Chile | + |
| ZPC | Pucón |  | Chile | + |
| PMC | Puerto Montt |  | Chile |  |
| PNT | Puerto Natales |  | Chile |  |
| WPU | Puerto Williams |  | Chile | + |
| PUQ | Punta Arenas |  | Chile |  |
| SCL | Santiago |  | Chile |  |
| TLX | Talca |  | Chile | + |
| TTC | Taltal |  | Chile | + |
| PZS | Temuco |  | Chile | + |
| ZCO | Temuco |  | Chile |  |
| TOQ | Tocopilla |  | Chile | + |
| ZAL | Valdivia |  | Chile |  |
| VLR | Vallenar |  | Chile | + |
| ZIC | Victoria, Chile |  | Chile | + |
| KNA | Viña del Mar |  | Chile | + |
| HAY | Aguachica |  | Colombia | + |
| API | Apiay |  | Colombia | + |
| AUC | Arauca |  | Colombia |  |
| AXM | Armenia |  | Colombia |  |
| BSC | Bahía Solano |  | Colombia |  |
| EJA | Barrancabermeja |  | Colombia |  |
| BAQ | Barranquilla |  | Colombia |  |
| BOG | Bogota |  | Colombia |  |
| BGA | Bucaramanga |  | Colombia |  |
| BUN | Buenaventura |  | Colombia |  |
| CLO | Cali |  | Colombia |  |
| APO | Carepa |  | Colombia |  |
| CTG | Cartagena | Carthagène | Colombia |  |
| CRC | Cartago |  | Colombia | + |
| CAQ | Caucasia |  | Colombia | + |
| CZU | Corozal |  | Colombia |  |
| CVE | Coveñas |  | Colombia | + |
| CUC | Cúcuta |  | Colombia |  |
| EBG | El Bagre |  | Colombia | + |
| ELB | El Banco |  | Colombia | + |
| FLA | Florencia |  | Colombia |  |
| GIR | Girardot |  | Colombia | + |
| GPI | Guapi |  | Colombia |  |
| IBE | Ibagué |  | Colombia |  |
| IPI | Ipiales |  | Colombia |  |
| LCR | La Chorrera |  | Colombia | + |
| PAL | La Dorada |  | Colombia | + |
| LMC | La Macarena |  | Colombia | + |
| LPD | La Pedrera |  | Colombia | + |
| LET | Leticia |  | Colombia |  |
| MGN | Magangué |  | Colombia | + |
| MCJ | Maicao |  | Colombia | + |
| MZL | Manizales |  | Colombia |  |
| MQU | Mariquita |  | Colombia | + |
| MDE | Medellin |  | Colombia |  |
| EOH | Medellín |  | Colombia |  |
| MVP | Mitú |  | Colombia |  |
| MTB | Montelíbano |  | Colombia | + |
| MTR | Montería |  | Colombia |  |
| NVA | Neiva |  | Colombia |  |
| NQU | Nuquí |  | Colombia | + |
| OCV | Ocaña |  | Colombia | + |
| PSO | Pasto |  | Colombia |  |
| PZA | Paz de Ariporo |  | Colombia | + |
| PEI | Pereira |  | Colombia |  |
| PTX | Pitalito |  | Colombia | + |
| PPN | Popayán |  | Colombia |  |
| PVA | Providencia |  | Colombia |  |
| PUU | Puerto Asís |  | Colombia |  |
| PCR | Puerto Carreño |  | Colombia |  |
| MSK | Puerto Gaitán |  | Colombia | + |
| PDA | Puerto Inírida |  | Colombia |  |
| LQM | Puerto Leguízamo |  | Colombia | + |
| UIB | Quibdó |  | Colombia |  |
| RCH | Riohacha |  | Colombia |  |
| ADZ | San Andrés |  | Colombia |  |
| SJE | San José del Guaviare |  | Colombia |  |
| SVI | San Vicente del Caguán |  | Colombia |  |
| SMR | Santa Marta |  | Colombia |  |
| TLU | Santiago de Tolú |  | Colombia | + |
| RVE | Saravena |  | Colombia | + |
| TME | Tame |  | Colombia |  |
| TCD | Tarapacá |  | Colombia | + |
| TQS | Tres Esquinas |  | Colombia | + |
| ULQ | Tuluá |  | Colombia | + |
| TCO | Tumaco |  | Colombia |  |
| VUP | Valledupar |  | Colombia |  |
| VGZ | Villa Garzón |  | Colombia | + |
| VVC | Villavicencio |  | Colombia |  |
| EYP | Yopal |  | Colombia |  |
| BCL | Barra del Colorado |  | Costa Rica | + |
| ACO | Cóbano |  | Costa Rica | + |
| OTR | Corredores |  | Costa Rica | + |
| DRK | Drake Bay |  | Costa Rica | + |
| GLF | Golfito |  | Costa Rica |  |
| GPL | Guápiles |  | Costa Rica | + |
| FON | La Fortuna |  | Costa Rica |  |
| LIR | Liberia |  | Costa Rica |  |
| LIO | Limón |  | Costa Rica |  |
| LSL | Los Chiles |  | Costa Rica | + |
| NOB | Nicoya |  | Costa Rica |  |
| PMZ | Palmar Sur |  | Costa Rica | + |
| PJM | Puerto Jimenez |  | Costa Rica |  |
| BAI | Punta Arenas, Costa Rica |  | Costa Rica | + |
| XQP | Quepos |  | Costa Rica |  |
| SJO | San Jose |  | Costa Rica |  |
| SYQ | San Jose |  | Costa Rica |  |
| TNO | Tamarindo |  | Costa Rica | + |
| TTQ | Tortuguero |  | Costa Rica | + |
| UPL | Upala |  | Costa Rica | + |
| BCA | Baracoa |  | Cuba |  |
| BYM | Bayamo |  | Cuba |  |
| CMW | Camaguey |  | Cuba |  |
| CCC | Cayo Coco |  | Cuba |  |
| CYO | Cayo Largo del Sur |  | Cuba |  |
| AVI | Ciego de Ávila |  | Cuba | + |
| CFG | Cienfuegos |  | Cuba |  |
| GAO | Guantánamo |  | Cuba | + |
| NBW | Guantanamo Bay |  | Cuba | + |
| HAV | Havana | La Havane | Cuba |  |
| UPB | Havana | La Havane | Cuba | + |
| HOG | Holguin | Holguín | Cuba |  |
| SZJ | Isla de la Juventud |  | Cuba | + |
| VTU | Las Tunas |  | Cuba |  |
| MZO | Manzanillo |  | Cuba |  |
| MOA | Moa |  | Cuba | + |
| GER | Nueva Gerona |  | Cuba |  |
| SNJ | Sandino |  | Cuba | + |
| SNU | Santa Clara |  | Cuba |  |
| SCU | Santiago de Cuba |  | Cuba |  |
| TND | Trinidad |  | Cuba |  |
| VRA | Varadero |  | Cuba |  |
| VRO | Varadero |  | Cuba | + |
| CUR | Curacao | Curaçao | Curaçao |  |
| DCF | Canefield |  | Dominica | + |
| DOM | Dominica | Dominique | Dominica |  |
| BRX | Barahona |  | Dominican Republic |  |
| CBJ | Cabo Rojo |  | Dominican Republic | + |
| JBQ | La Isabela |  | Dominican Republic |  |
| LRM | La Romana |  | Dominican Republic |  |
| POP | Puerto Plata |  | Dominican Republic |  |
| PUJ | Punta Cana |  | Dominican Republic |  |
| AZS | Samana |  | Dominican Republic |  |
| STI | Santiago |  | Dominican Republic |  |
| SDQ | Santo Domingo | Saint-Domingue | Dominican Republic |  |
| ATF | Ambato |  | Ecuador | + |
| GPS | Baltra |  | Ecuador | + |
| LOH | Catamayo |  | Ecuador | + |
| OCC | Coca |  | Ecuador | + |
| CUE | Cuenca |  | Ecuador | + |
| ESM | Esmeraldas |  | Ecuador | + |
| GYE | Guayaquil |  | Ecuador |  |
| LTX | Latacunga |  | Ecuador | + |
| MRR | Macará |  | Ecuador | + |
| XMS | Macas |  | Ecuador | + |
| MEC | Manta |  | Ecuador | + |
| PVO | Portoviejo |  | Ecuador | + |
| IBB | Puerto Villamil |  | Ecuador | + |
| UIO | Quito |  | Ecuador |  |
| SNC | Salinas, Ecuador |  | Ecuador | + |
| SCY | San Cristóbal, Ecuador |  | Ecuador | + |
| ETR | Santa Rosa, Ecuador |  | Ecuador | + |
| TPC | Tarapoa |  | Ecuador | + |
| TNW | Tena |  | Ecuador | + |
| TUA | Tulcán |  | Ecuador | + |
| ILS | San Salvador |  | El Salvador | + |
| SAL | San Salvador |  | El Salvador |  |
| MPN | Mount Pleasant |  | Falkland Islands | + |
| PSY | Stanley |  | Falkland Islands | + |
| OYC | Camopi |  | French Guiana | + |
| CAY | Cayenne |  | French Guiana | + |
| GSI | Grand-Santi |  | French Guiana | + |
| MPY | Maripasoula |  | French Guiana | + |
| OYP | Saint-Georges |  | French Guiana | + |
| LDX | Saint-Laurent-du-Maroni |  | French Guiana | + |
| XAU | Saül |  | French Guiana | + |
| AOQ | Aappilattoq |  | Greenland | + |
| QUV | Aappilattoq |  | Greenland | + |
| JEG | Aasiaat |  | Greenland | + |
| QCU | Akunnaaq |  | Greenland | + |
| LLU | Alluitsup Paa |  | Greenland | + |
| QUW | Ammassivik |  | Greenland | + |
| JRK | Arsuk |  | Greenland | + |
| QGQ | Attu |  | Greenland | + |
| QFG | Eqalugaarsuit |  | Greenland | + |
| QFX | Igaliku |  | Greenland | + |
| QFI | Iginniarfik |  | Greenland | + |
| QJI | Ikamiut |  | Greenland | + |
| IKE | Ikerasak |  | Greenland | + |
| QRY | Ikerassaarsuk |  | Greenland | + |
| XIQ | Ilimanaq |  | Greenland | + |
| IOT | Illorsuit |  | Greenland | + |
| JAV | Ilulissat |  | Greenland | + |
| IUI | Innarsuit |  | Greenland | + |
| IOQ | Isortoq |  | Greenland | + |
| OBY | Ittoqqortoormiit |  | Greenland | + |
| QPW | Kangaatsiaq |  | Greenland | + |
| SFJ | Kangerlussuaq |  | Greenland |  |
| KGQ | Kangersuatsiaq |  | Greenland | + |
| JGR | Kangilinnguit |  | Greenland | + |
| QJE | Kitsissuarsuit |  | Greenland | + |
| KHQ | Kullorsuaq |  | Greenland | + |
| KUS | Kulusuk |  | Greenland | + |
| KUZ | Kuummiut |  | Greenland | + |
| JSU | Maniitsoq |  | Greenland | + |
| JNN | Nanortalik |  | Greenland | + |
| JNS | Narsaq |  | Greenland | + |
| QFN | Narsarmijit |  | Greenland | + |
| UAK | Narsarsuaq |  | Greenland | + |
| CNP | Neerlerit Inaat |  | Greenland | + |
| NIQ | Niaqornat |  | Greenland | + |
| JUU | Nuugaatsiaq |  | Greenland | + |
| GOH | Nuuk |  | Greenland | + |
| NSQ | Nuussuaq |  | Greenland | + |
| JFR | Paamiut |  | Greenland | + |
| THU | Pituffik |  | Greenland | + |
| NAQ | Qaanaaq |  | Greenland | + |
| JQA | Qaarsut |  | Greenland | + |
| JJU | Qaqortoq |  | Greenland | + |
| JCH | Qasigiannguit |  | Greenland | + |
| QJH | Qassimiut |  | Greenland | + |
| PQT | Qeqertaq |  | Greenland | + |
| JGO | Qeqertarsuaq |  | Greenland | + |
| QOQ | Saarloq |  | Greenland | + |
| SAE | Saattut |  | Greenland | + |
| SVR | Savissivik |  | Greenland | + |
| SGG | Sermiligaaq |  | Greenland | + |
| SRK | Siorapaluk |  | Greenland | + |
| JHS | Sisimiut |  | Greenland | + |
| AGM | Tasiilaq |  | Greenland | + |
| XEQ | Tasiusak |  | Greenland | + |
| TQA | Tasiusaq |  | Greenland | + |
| TQI | Tiniteqilaaq |  | Greenland | + |
| JUK | Ukkusissat |  | Greenland | + |
| JUV | Upernavik |  | Greenland | + |
| UMD | Uummannaq |  | Greenland | + |
| CRU | Carriacou |  | Grenada | + |
| GND | Grenada |  | Grenada |  |
| BBR | Basse-Terre |  | Guadeloupe | + |
| DSD | La Désirade |  | Guadeloupe | + |
| GBJ | Marie-Galante |  | Guadeloupe | + |
| PTP | Pointe-à-Pitre |  | Guadeloupe |  |
| SFC | Saint-François |  | Guadeloupe | + |
| CBV | Cobán |  | Guatemala | + |
| GUA | Guatemala City | Guatemala | Guatemala |  |
| HUG | Huehuetenango |  | Guatemala | + |
| PBR | Puerto Barrios |  | Guatemala |  |
| GSJ | Puerto San José |  | Guatemala | + |
| AAZ | Quetzaltenango |  | Guatemala | + |
| RER | Retalhuleu |  | Guatemala |  |
| RUV | Rubelsanto |  | Guatemala | + |
| FRS | San Benito |  | Guatemala |  |
| GEO | Georgetown |  | Guyana |  |
| OGL | Georgetown |  | Guyana | + |
| KAI | Kaieteur Falls |  | Guyana | + |
| LTM | Lethem |  | Guyana | + |
| CAP | Cap-Haïtien |  | Haiti |  |
| JAK | Jacmel |  | Haiti | + |
| JEE | Jérémie |  | Haiti | + |
| CYA | Les Cayes |  | Haiti |  |
| PAP | Port-au-Prince |  | Haiti | + |
| PAX | Port-de-Paix |  | Haiti | + |
| GJA | Guanaja |  | Honduras | + |
| LCE | La Ceiba |  | Honduras | + |
| PEU | Puerto Lempira |  | Honduras | + |
| RTB | Roatan | Roatán | Honduras |  |
| SAP | San Pedro Sula |  | Honduras |  |
| TGU | Tegucigalpa |  | Honduras | + |
| XPL | Tegucigalpa |  | Honduras |  |
| TEA | Tela |  | Honduras | + |
| TJI | Trujillo, Honduras |  | Honduras | + |
| UII | Utila |  | Honduras | + |
| OCJ | Boscobel |  | Jamaica |  |
| POT | Ken Jones |  | Jamaica | + |
| KIN | Kingston |  | Jamaica |  |
| MBJ | Montego Bay |  | Jamaica |  |
| KTP | Tinson Pen |  | Jamaica |  |
| FDF | Fort de France | Fort-de-France | Martinique |  |
| ACA | Acapulco |  | Mexico |  |
| AGU | Aguascalientes |  | Mexico |  |
| CSW | Cabo San Lucas |  | Mexico |  |
| CPE | Campeche |  | Mexico |  |
| CUN | Cancun | Cancún | Mexico |  |
| CYW | Celaya |  | Mexico | + |
| CTM | Chetumal |  | Mexico |  |
| CUU | Chihuahua |  | Mexico |  |
| ACN | Ciudad Acuña |  | Mexico | + |
| CUA | Ciudad Constitución |  | Mexico | + |
| CME | Ciudad del Carmen |  | Mexico |  |
| CJS | Ciudad Juárez |  | Mexico |  |
| TAM | Ciudad Madero |  | Mexico |  |
| CEN | Ciudad Obregón |  | Mexico |  |
| CVM | Ciudad Victoria |  | Mexico |  |
| CLQ | Colima |  | Mexico |  |
| CZM | Cozumel |  | Mexico |  |
| CVJ | Cuernavaca |  | Mexico | + |
| CUL | Culiacán |  | Mexico |  |
| DGO | Durango |  | Mexico |  |
| ESE | Ensenada |  | Mexico | + |
| GDL | Guadalajara |  | Mexico |  |
| GYM | Guaymas |  | Mexico |  |
| GUB | Guerrero Negro |  | Mexico | + |
| HMO | Hermosillo |  | Mexico |  |
| HUX | Huatulco |  | Mexico |  |
| ZIH | Ixtapa |  | Mexico |  |
| IZT | Ixtepec |  | Mexico |  |
| LAP | La Paz |  | Mexico |  |
| LZC | Lázaro Cárdenas |  | Mexico | + |
| LTO | Loreto |  | Mexico |  |
| SJD | Los Cabos |  | Mexico |  |
| LMM | Los Mochis |  | Mexico |  |
| ZLO | Manzanillo |  | Mexico |  |
| MAM | Matamoros |  | Mexico |  |
| MZT | Mazatlan |  | Mexico |  |
| MID | Merida |  | Mexico |  |
| MXL | Mexicali |  | Mexico |  |
| MEX | Mexico City | Mexico | Mexico |  |
| NLU | Mexico City |  | Mexico |  |
| MTT | Minatitlán |  | Mexico |  |
| LOV | Monclova |  | Mexico | + |
| MTY | Monterrey |  | Mexico |  |
| NTR | Monterrey |  | Mexico | + |
| MLM | Morelia |  | Mexico |  |
| SRL | Mulegé |  | Mexico | + |
| NOG | Nogales, Mexico |  | Mexico | + |
| NLD | Nuevo Laredo |  | Mexico |  |
| OAX | Oaxaca |  | Mexico |  |
| PQM | Palenque |  | Mexico | + |
| PDS | Piedras Negras |  | Mexico |  |
| PAZ | Poza Rica |  | Mexico |  |
| PBC | Puebla |  | Mexico |  |
| PXM | Puerto Escondido |  | Mexico |  |
| PPE | Puerto Peñasco |  | Mexico | + |
| PVR | Puerto Vallarta |  | Mexico |  |
| QRO | Querétaro |  | Mexico |  |
| REX | Reynosa |  | Mexico |  |
| SLW | Saltillo |  | Mexico |  |
| SLP | San Luis Potosí |  | Mexico |  |
| BJX | Silao |  | Mexico |  |
| TAP | Tapachula |  | Mexico |  |
| TPQ | Tepic |  | Mexico |  |
| TIJ | Tijuana |  | Mexico |  |
| TLC | Toluca |  | Mexico |  |
| TRC | Torreón |  | Mexico |  |
| TQO | Tulum |  | Mexico |  |
| TGZ | Tuxtla Gutiérrez |  | Mexico |  |
| UPN | Uruapan |  | Mexico |  |
| VER | Veracruz |  | Mexico |  |
| VSA | Villahermosa |  | Mexico |  |
| JAL | Xalapa |  | Mexico | + |
| ZCL | Zacatecas |  | Mexico |  |
| MNI | Montserrat |  | Montserrat | + |
| BEF | Bluefields |  | Nicaragua | + |
| RNI | Corn Island |  | Nicaragua | + |
| MGA | Managua |  | Nicaragua |  |
| PUZ | Puerto Cabezas |  | Nicaragua | + |
| PAC | Albrook |  | Panama |  |
| CHX | Changuinola |  | Panama |  |
| CTD | Chitré |  | Panama |  |
| ONX | Colón |  | Panama |  |
| OTD | Contadora |  | Panama | + |
| DAV | David |  | Panama |  |
| BOC | Isla Colón |  | Panama |  |
| BLB | Panama City |  | Panama | + |
| PTY | Panama City |  | Panama |  |
| PDM | Pedasí |  | Panama | + |
| BFQ | Puerto Piña |  | Panama | + |
| RIH | Río Hato |  | Panama | + |
| SYP | Santiago, Panama |  | Panama | + |
| ASU | Asuncion |  | Paraguay |  |
| AYO | Ayolas |  | Paraguay | + |
| AGT | Ciudad del Este |  | Paraguay | + |
| CIO | Concepción, Paraguay |  | Paraguay | + |
| ENO | Encarnación |  | Paraguay | + |
| ESG | Mariscal Estigarribia |  | Paraguay | + |
| PJC | Pedro Juan Caballero |  | Paraguay | + |
| PIL | Pilar |  | Paraguay | + |
| VMI | Puerto Vallemí |  | Paraguay | + |
| ANS | Andahuaylas |  | Peru | + |
| AQP | Arequipa |  | Peru |  |
| AYX | Atalaya |  | Peru | + |
| AYP | Ayacucho |  | Peru |  |
| CJA | Cajamarca |  | Peru |  |
| CHH | Chachapoyas |  | Peru |  |
| CIX | Chiclayo |  | Peru |  |
| CHM | Chimbote |  | Peru |  |
| CUZ | Cusco |  | Peru |  |
| HUU | Huánuco |  | Peru |  |
| ATA | Huaraz |  | Peru | + |
| IBP | Iberia |  | Peru | + |
| ILQ | Ilo |  | Peru |  |
| IQT | Iquitos |  | Peru |  |
| JAE | Jaén |  | Peru |  |
| JAU | Jauja |  | Peru |  |
| JJI | Juanjuí |  | Peru | + |
| JUL | Juliaca |  | Peru |  |
| LIM | Lima |  | Peru |  |
| MZA | Mazamari |  | Peru | + |
| NZC | Nazca |  | Peru |  |
| PIO | Pisco |  | Peru | + |
| PIU | Piura |  | Peru |  |
| PCL | Pucallpa |  | Peru |  |
| PEM | Puerto Maldonado |  | Peru |  |
| RIJ | Rioja |  | Peru | + |
| TCQ | Tacna |  | Peru |  |
| TYL | Talara |  | Peru |  |
| TPP | Tarapoto |  | Peru |  |
| TGI | Tingo María |  | Peru | + |
| TRU | Trujillo |  | Peru |  |
| TBP | Tumbes |  | Peru |  |
| YMS | Yurimaguas |  | Peru |  |
| BQN | Aguadilla |  | Puerto Rico |  |
| ARE | Arecibo |  | Puerto Rico | + |
| NRR | Ceiba |  | Puerto Rico |  |
| CPX | Culebra |  | Puerto Rico |  |
| MAZ | Mayaguez |  | Puerto Rico |  |
| PSE | Ponce |  | Puerto Rico |  |
| SIG | San Juan |  | Puerto Rico |  |
| SJU | San Juan |  | Puerto Rico |  |
| VQS | Vieques |  | Puerto Rico |  |
| SBH | St Barts | Saint-Barth | Saint Barthélemy |  |
| NEV | Nevis |  | Saint Kitts and Nevis | + |
| SKB | St Kitts | Saint-Kitts | Saint Kitts and Nevis |  |
| SLU | Castries |  | Saint Lucia |  |
| UVF | St Lucia | Sainte-Lucie | Saint Lucia |  |
| SFG | Grand Case |  | Saint Martin | + |
| MQC | Miquelon |  | Saint Pierre and Miquelon | + |
| FSP | Saint-Pierre |  | Saint Pierre and Miquelon |  |
| BQU | Bequia |  | Saint Vincent and the Grenadines | + |
| CIW | Canouan |  | Saint Vincent and the Grenadines | + |
| MQS | Mustique |  | Saint Vincent and the Grenadines | + |
| SVD | St Vincent | Saint-Vincent | Saint Vincent and the Grenadines |  |
| UNI | Union Island |  | Saint Vincent and the Grenadines | + |
| SXM | St Maarten | Saint-Martin | Sint Maarten |  |
| DRJ | Drietabbetje |  | Suriname | + |
| MOJ | Moengo |  | Suriname | + |
| EAX | Paramaribo |  | Suriname | + |
| ORG | Paramaribo |  | Suriname | + |
| PBM | Paramaribo |  | Suriname | + |
| AGI | Wageningen |  | Suriname | + |
| POS | Port of Spain |  | Trinidad and Tobago |  |
| TAB | Tobago |  | Trinidad and Tobago |  |
| GDT | Grand Turk |  | Turks and Caicos Islands | + |
| NCA | North Caicos |  | Turks and Caicos Islands | + |
| PLS | Providenciales |  | Turks and Caicos Islands |  |
| SLX | Salt Cay |  | Turks and Caicos Islands | + |
| XSC | South Caicos |  | Turks and Caicos Islands | + |
| SPB | Charlotte Amalie |  | U.S. Virgin Islands | + |
| SSB | Christiansted |  | U.S. Virgin Islands | + |
| STX | St Croix | Sainte-Croix | U.S. Virgin Islands |  |
| STT | St Thomas | Saint-Thomas | U.S. Virgin Islands |  |
| ABR | Aberdeen |  | United States |  |
| APG | Aberdeen, MD |  | United States | + |
| ABI | Abilene |  | United States |  |
| DYS | Abilene |  | United States | + |
| ADT | Ada |  | United States | + |
| ADK | Adak |  | United States |  |
| AKK | Akhiok |  | United States |  |
| KKI | Akiachak |  | United States |  |
| AKI | Akiak |  | United States |  |
| AKC | Akron |  | United States | + |
| CAK | Akron |  | United States |  |
| KQA | Akutan |  | United States |  |
| AUK | Alakanuk |  | United States |  |
| ALM | Alamogordo |  | United States | + |
| HMN | Alamogordo |  | United States | + |
| ALS | Alamosa |  | United States |  |
| ABY | Albany |  | United States |  |
| ALB | Albany |  | United States |  |
| ABQ | Albuquerque |  | United States |  |
| WKK | Aleknagik |  | United States |  |
| AEX | Alexandria |  | United States |  |
| ESF | Alexandria |  | United States | + |
| AXN | Alexandria, MN |  | United States | + |
| ALI | Alice |  | United States | + |
| AET | Allakaket |  | United States |  |
| ABE | Allentown |  | United States |  |
| AIA | Alliance |  | United States |  |
| APN | Alpena |  | United States |  |
| AOO | Altoona |  | United States |  |
| LTS | Altus |  | United States | + |
| AMA | Amarillo |  | United States |  |
| ABL | Ambler |  | United States |  |
| AOS | Amook Bay |  | United States |  |
| OTS | Anacortes |  | United States |  |
| AKP | Anaktuvuk Pass |  | United States |  |
| ANC | Anchorage |  | United States |  |
| EDF | Anchorage |  | United States | + |
| MRI | Anchorage |  | United States |  |
| AND | Anderson |  | United States | + |
| AXX | Angel Fire |  | United States | + |
| LJN | Angleton |  | United States | + |
| AGN | Angoon |  | United States |  |
| ANI | Aniak |  | United States |  |
| ANB | Anniston |  | United States | + |
| ANV | Anvik |  | United States |  |
| ATW | Appleton |  | United States |  |
| ACV | Arcata |  | United States |  |
| ARC | Arctic Village |  | United States |  |
| AVL | Asheville |  | United States |  |
| JFN | Ashtabula |  | United States | + |
| ASE | Aspen |  | United States |  |
| AST | Astoria |  | United States | + |
| AHN | Athens, GA |  | United States | + |
| AKB | Atka |  | United States |  |
| ATL | Atlanta |  | United States |  |
| FTY | Atlanta |  | United States | + |
| PDK | Atlanta |  | United States |  |
| ACY | Atlantic City |  | United States |  |
| ATT | Atmautluak |  | United States |  |
| ATK | Atqasuk |  | United States |  |
| AGS | Augusta |  | United States |  |
| AUG | Augusta |  | United States |  |
| DNL | Augusta |  | United States | + |
| BFK | Aurora |  | United States | + |
| AUS | Austin |  | United States |  |
| BKE | Baker City |  | United States | + |
| BFL | Bakersfield |  | United States |  |
| BWI | Baltimore |  | United States |  |
| MTN | Baltimore |  | United States | + |
| BGR | Bangor |  | United States |  |
| BHB | Bar Harbor |  | United States |  |
| MPV | Barre |  | United States | + |
| BTI | Barter Island |  | United States |  |
| BTR | Baton Rouge |  | United States |  |
| BTL | Battle Creek |  | United States | + |
| BDE | Baudette |  | United States | + |
| BPT | Beaumont |  | United States |  |
| WBQ | Beaver |  | United States |  |
| BFP | Beaver Falls |  | United States | + |
| BKW | Beckley |  | United States |  |
| BED | Bedford |  | United States |  |
| BLV | Belleville |  | United States |  |
| BLI | Bellingham |  | United States |  |
| BJI | Bemidji |  | United States |  |
| XNA | Bentonville |  | United States |  |
| BET | Bethel |  | United States |  |
| BTT | Bettles |  | United States |  |
| BVY | Beverly |  | United States | + |
| BPI | Big Piney |  | United States | + |
| BIL | Billings |  | United States |  |
| BIX | Biloxi |  | United States | + |
| BGM | Binghamton |  | United States |  |
| KBC | Birch Creek |  | United States |  |
| BHM | Birmingham |  | United States |  |
| BIH | Bishop |  | United States |  |
| BIS | Bismarck |  | United States |  |
| BYW | Blakely Island |  | United States |  |
| BID | Block Island |  | United States |  |
| BMI | Bloomington |  | United States |  |
| BMG | Bloomington, IN |  | United States | + |
| BLF | Bluefield |  | United States | + |
| BLH | Blythe |  | United States | + |
| BYH | Blytheville |  | United States | + |
| BCT | Boca Raton |  | United States | + |
| BOI | Boise |  | United States |  |
| BAD | Bossier City |  | United States | + |
| BOS | Boston |  | United States |  |
| BLD | Boulder City |  | United States |  |
| BWG | Bowling Green |  | United States | + |
| BZN | Bozeman |  | United States |  |
| BFD | Bradford |  | United States |  |
| BBD | Brady |  | United States | + |
| BRD | Brainerd |  | United States |  |
| BKG | Branson |  | United States |  |
| PWT | Bremerton |  | United States | + |
| KTS | Brevig Mission |  | United States |  |
| CKB | Bridgeport |  | United States |  |
| BDR | Bridgeport, CT |  | United States | + |
| BRO | Brownsville |  | United States |  |
| BQK | Brunswick |  | United States |  |
| NHZ | Brunswick, ME |  | United States | + |
| BCE | Bryce Canyon |  | United States | + |
| BKC | Buckland |  | United States |  |
| BUF | Buffalo |  | United States |  |
| IFP | Bullhead City |  | United States | + |
| BUR | Burbank |  | United States |  |
| BYI | Burley |  | United States | + |
| BRL | Burlington |  | United States |  |
| BTV | Burlington |  | United States |  |
| BNO | Burns |  | United States | + |
| BTM | Butte |  | United States |  |
| CDW | Caldwell |  | United States | + |
| VOK | Camp Douglas |  | United States | + |
| ADW | Camp Springs |  | United States | + |
| CGI | Cape Girardeau |  | United States |  |
| LUR | Cape Lisburne |  | United States |  |
| EHM | Cape Newenham |  | United States | + |
| CZF | Cape Romanzof |  | United States | + |
| MDH | Carbondale |  | United States | + |
| CAR | Caribou |  | United States | + |
| CLD | Carlsbad |  | United States |  |
| CNM | Carlsbad |  | United States |  |
| CSN | Carson City |  | United States | + |
| CPR | Casper |  | United States |  |
| CDC | Cedar City |  | United States |  |
| CID | Cedar Rapids |  | United States |  |
| CWS | Center Island |  | United States |  |
| CEM | Central |  | United States |  |
| CDR | Chadron |  | United States |  |
| CIK | Chalkyitsik |  | United States |  |
| CMI | Champaign |  | United States |  |
| CNU | Chanute |  | United States | + |
| CCY | Charles City |  | United States | + |
| CHS | Charleston |  | United States |  |
| CRW | Charleston |  | United States |  |
| CLT | Charlotte |  | United States |  |
| CHO | Charlottesville |  | United States |  |
| CYM | Chatham |  | United States |  |
| CHA | Chattanooga |  | United States |  |
| CYF | Chefornak |  | United States |  |
| NCN | Chenega |  | United States |  |
| VAK | Chevak |  | United States |  |
| CYS | Cheyenne |  | United States |  |
| PWK | Chicago |  | United States | + |
| MDW | Chicago · Midway |  | United States |  |
| ORD | Chicago · O'Hare |  | United States |  |
| CKX | Chicken |  | United States |  |
| CEF | Chicopee |  | United States | + |
| KCG | Chignik |  | United States |  |
| KCQ | Chignik Lake |  | United States |  |
| CDS | Childress |  | United States | + |
| CZN | Chisana |  | United States | + |
| CHU | Chuathbaluk |  | United States |  |
| CVG | Cincinnati |  | United States |  |
| LUK | Cincinnati |  | United States |  |
| IRC | Circle |  | United States |  |
| CLP | Clarks Point |  | United States |  |
| BKL | Cleveland |  | United States | + |
| CGF | Cleveland |  | United States | + |
| CLE | Cleveland |  | United States |  |
| CVN | Clovis |  | United States |  |
| CVS | Clovis |  | United States | + |
| COF | Cocoa Beach |  | United States | + |
| COD | Cody |  | United States |  |
| COE | Coeur d'Alene |  | United States | + |
| KCC | Coffman Cove |  | United States |  |
| CDB | Cold Bay |  | United States |  |
| CLL | College Station |  | United States |  |
| COS | Colorado Springs |  | United States |  |
| CAE | Columbia |  | United States |  |
| COU | Columbia |  | United States |  |
| CUB | Columbia |  | United States | + |
| CBM | Columbus |  | United States | + |
| CMH | Columbus |  | United States |  |
| CSG | Columbus |  | United States |  |
| GTR | Columbus |  | United States |  |
| LCK | Columbus |  | United States |  |
| OSU | Columbus |  | United States | + |
| CLU | Columbus, IN |  | United States | + |
| OLU | Columbus, NE |  | United States | + |
| CCR | Concord |  | United States |  |
| USA | Concord |  | United States |  |
| CON | Concord, NH |  | United States | + |
| CDV | Cordova |  | United States |  |
| CRP | Corpus Christi |  | United States |  |
| NGP | Corpus Christi |  | United States | + |
| CEZ | Cortez |  | United States |  |
| CVO | Corvallis |  | United States | + |
| CGA | Craig |  | United States |  |
| CEC | Crescent City |  | United States |  |
| CEW | Crestview |  | United States | + |
| EGI | Crestview |  | United States | + |
| CKD | Crooked Creek |  | United States |  |
| CSV | Crossville |  | United States | + |
| CTB | Cut Bank |  | United States | + |
| DAG | Daggett |  | United States | + |
| DHT | Dalhart |  | United States | + |
| ADS | Dallas Addison |  | United States |  |
| DFW | Dallas/Fort Worth |  | United States |  |
| DAL | Dallas · Love Field |  | United States |  |
| DXR | Danbury |  | United States | + |
| DAN | Danville |  | United States | + |
| DAY | Dayton |  | United States |  |
| FFO | Dayton |  | United States | + |
| DAB | Daytona Beach |  | United States |  |
| SCC | Deadhorse |  | United States |  |
| DEC | Decatur |  | United States |  |
| DTR | Decatur |  | United States |  |
| DHB | Deer Harbor |  | United States |  |
| DRG | Deering |  | United States |  |
| DLF | Del Rio |  | United States | + |
| DRT | Del Rio |  | United States | + |
| BIG | Delta Junction |  | United States | + |
| DMN | Deming |  | United States | + |
| PNX | Denison |  | United States | + |
| APA | Denver |  | United States | + |
| BJC | Denver |  | United States |  |
| DEN | Denver |  | United States |  |
| DRI | Deridder |  | United States | + |
| DSM | Des Moines |  | United States |  |
| DSI | Destin |  | United States |  |
| VPS | Destin |  | United States |  |
| DET | Detroit | Détroit | United States | + |
| DTW | Detroit | Détroit | United States |  |
| YIP | Detroit | Détroit | United States | + |
| DVL | Devils Lake |  | United States |  |
| DIK | Dickinson |  | United States |  |
| DLG | Dillingham |  | United States |  |
| DIO | Diomede |  | United States |  |
| DDC | Dodge City |  | United States |  |
| DHN | Dothan |  | United States |  |
| DUG | Douglas |  | United States | + |
| DOV | Dover |  | United States |  |
| DUJ | Dubois |  | United States |  |
| DBQ | Dubuque |  | United States |  |
| DLH | Duluth |  | United States |  |
| DRO | Durango |  | United States |  |
| DUA | Durant |  | United States | + |
| EAA | Eagle |  | United States |  |
| EGE | Eagle Vail |  | United States |  |
| FRG | East Farmingdale |  | United States | + |
| MMT | Eastover |  | United States | + |
| ESD | Eastsound |  | United States |  |
| WDN | Eastsound |  | United States |  |
| EAU | Eau Claire |  | United States |  |
| EDA | Edna Bay |  | United States |  |
| EDW | Edwards |  | United States | + |
| EEK | Eek |  | United States |  |
| EGX | Egegik |  | United States |  |
| NJK | El Centro |  | United States | + |
| ELD | El Dorado |  | United States |  |
| ELP | El Paso |  | United States |  |
| ELV | Elfin Cove |  | United States |  |
| ELI | Elim |  | United States |  |
| ECG | Elizabeth City |  | United States | + |
| EKN | Elkins |  | United States | + |
| EKO | Elko |  | United States |  |
| ELM | Elmira |  | United States |  |
| LYU | Ely, MN |  | United States | + |
| ELY | Ely, NV |  | United States | + |
| EMK | Emmonak |  | United States |  |
| END | Enid |  | United States | + |
| ERI | Erie |  | United States |  |
| ESC | Escanaba |  | United States |  |
| EUG | Eugene |  | United States |  |
| EKA | Eureka |  | United States | + |
| EVW | Evanston |  | United States | + |
| EVV | Evansville |  | United States |  |
| PAE | Everett |  | United States |  |
| EXI | Excursion Inlet |  | United States |  |
| EIL | Fairbanks |  | United States | + |
| FAI | Fairbanks |  | United States |  |
| FBK | Fairbanks |  | United States | + |
| SUU | Fairfield |  | United States | + |
| NFL | Fallon |  | United States | + |
| KFP | False Pass |  | United States |  |
| FAR | Fargo |  | United States |  |
| FMN | Farmington |  | United States |  |
| FAY | Fayetteville |  | United States |  |
| FYV | Fayetteville, AR |  | United States | + |
| FDY | Findlay |  | United States | + |
| FLG | Flagstaff |  | United States |  |
| FNT | Flint |  | United States |  |
| FLO | Florence |  | United States |  |
| DAA | Fort Belvoir |  | United States | + |
| LSF | Fort Benning |  | United States | + |
| BIF | Fort Bliss |  | United States | + |
| FBG | Fort Bragg |  | United States | + |
| POB | Fort Bragg |  | United States | + |
| HOP | Fort Campbell |  | United States | + |
| FCS | Fort Carson |  | United States | + |
| GRK | Fort Cavazos |  | United States |  |
| FOD | Fort Dodge |  | United States |  |
| MUI | Fort Indiantown Gap |  | United States | + |
| BYS | Fort Irwin |  | United States | + |
| FTK | Fort Knox |  | United States | + |
| FLL | Fort Lauderdale |  | United States |  |
| FXE | Fort Lauderdale |  | United States | + |
| TBN | Fort Leonard Wood |  | United States |  |
| GRF | Fort Lewis |  | United States | + |
| FME | Fort Meade |  | United States | + |
| FMY | Fort Myers |  | United States | + |
| RSW | Fort Myers |  | United States |  |
| FPR | Fort Pierce |  | United States | + |
| POE | Fort Polk |  | United States | + |
| FRI | Fort Riley |  | United States | + |
| OZR | Fort Rucker |  | United States | + |
| FSI | Fort Sill |  | United States | + |
| FSM | Fort Smith |  | United States |  |
| FST | Fort Stockton |  | United States | + |
| FWA | Fort Wayne |  | United States |  |
| AFW | Fort Worth |  | United States | + |
| FTW | Fort Worth |  | United States |  |
| FWH | Fort Worth |  | United States | + |
| FYU | Fort Yukon |  | United States |  |
| FKL | Franklin |  | United States | + |
| FAT | Fresno |  | United States |  |
| FBS | Friday Harbor |  | United States |  |
| FRD | Friday Harbor |  | United States |  |
| SSW | Friday Harbor |  | United States |  |
| FNR | Funter Bay |  | United States |  |
| GNV | Gainesville |  | United States |  |
| GAL | Galena |  | United States |  |
| GUP | Gallup |  | United States |  |
| GLS | Galveston |  | United States | + |
| GAM | Gambell |  | United States |  |
| GCK | Garden City |  | United States |  |
| GYY | Gary |  | United States |  |
| GCC | Gillette |  | United States |  |
| GGW | Glasgow |  | United States |  |
| LUF | Glendale |  | United States | + |
| GDV | Glendive |  | United States |  |
| GFL | Glens Falls |  | United States | + |
| GSB | Goldsboro |  | United States | + |
| GLV | Golovin |  | United States |  |
| GLD | Goodland |  | United States | + |
| GNU | Goodnews |  | United States |  |
| GCN | Grand Canyon |  | United States |  |
| GCW | Grand Canyon West |  | United States | + |
| GFK | Grand Forks |  | United States |  |
| RDR | Grand Forks |  | United States | + |
| GRI | Grand Island |  | United States |  |
| GJT | Grand Junction |  | United States |  |
| GRR | Grand Rapids |  | United States |  |
| KGX | Grayling |  | United States |  |
| GTF | Great Falls |  | United States |  |
| GRB | Green Bay |  | United States |  |
| GSO | Greensboro |  | United States |  |
| GLH | Greenville |  | United States |  |
| GMU | Greenville |  | United States | + |
| GSP | Greenville |  | United States |  |
| PGV | Greenville |  | United States |  |
| GWO | Greenwood, MS |  | United States | + |
| GUS | Grissom |  | United States | + |
| GON | Groton |  | United States | + |
| GUF | Gulf Shores |  | United States | + |
| GPT | Gulfport |  | United States |  |
| GKN | Gulkana |  | United States |  |
| GUC | Gunnison |  | United States |  |
| GST | Gustavus |  | United States |  |
| GUY | Guymon |  | United States | + |
| HGR | Hagerstown |  | United States |  |
| HNS | Haines |  | United States |  |
| LFI | Hampton |  | United States | + |
| HNM | Hana |  | United States |  |
| PAK | Hanapepe |  | United States |  |
| CMX | Hancock |  | United States |  |
| HRL | Harlingen |  | United States |  |
| MDT | Harrisburg |  | United States |  |
| HRO | Harrison |  | United States |  |
| BDL | Hartford |  | United States |  |
| HFD | Hartford |  | United States | + |
| HBG | Hattiesburg |  | United States | + |
| PIB | Hattiesburg |  | United States |  |
| HVR | Havre |  | United States |  |
| UPP | Hawi |  | United States |  |
| HHR | Hawthorne |  | United States |  |
| HDN | Hayden |  | United States |  |
| HYS | Hays |  | United States |  |
| HYR | Hayward |  | United States | + |
| HKB | Healy Lake |  | United States | + |
| HLN | Helena |  | United States |  |
| HIB | Hibbing |  | United States |  |
| HKY | Hickory |  | United States | + |
| ITO | Hilo |  | United States |  |
| HHH | Hilton Head Island |  | United States |  |
| HBR | Hobart, OK |  | United States | + |
| HOB | Hobbs |  | United States |  |
| HYL | Hollis |  | United States |  |
| HWO | Hollywood |  | United States | + |
| HCR | Holy Cross |  | United States |  |
| HOM | Homer |  | United States |  |
| HST | Homestead |  | United States | + |
| HNL | Honolulu |  | United States |  |
| HNH | Hoonah |  | United States |  |
| HPB | Hooper Bay |  | United States |  |
| HQM | Hoquiam |  | United States | + |
| HOT | Hot Springs |  | United States |  |
| HUL | Houlton |  | United States | + |
| CXO | Houston |  | United States | + |
| EFD | Houston |  | United States | + |
| HOU | Houston · Hobby |  | United States |  |
| IAH | Houston · Intercontinental |  | United States |  |
| HUS | Hughes |  | United States |  |
| HTS | Huntington |  | United States |  |
| HSV | Huntsville |  | United States |  |
| HUA | Huntsville |  | United States | + |
| HTV | Huntsville, TX |  | United States | + |
| HON | Huron |  | United States | + |
| HSL | Huslia |  | United States |  |
| HUT | Hutchinson |  | United States | + |
| HYA | Hyannis |  | United States |  |
| HYG | Hydaburg |  | United States |  |
| WHD | Hyder |  | United States |  |
| IDA | Idaho Falls |  | United States |  |
| IGG | Igiugig |  | United States |  |
| ILI | Iliamna |  | United States |  |
| IPL | Imperial |  | United States |  |
| IND | Indianapolis |  | United States |  |
| INL | International Falls |  | United States |  |
| IMT | Iron Mountain |  | United States |  |
| IWD | Ironwood |  | United States |  |
| ITH | Ithaca |  | United States |  |
| JAN | Jackson |  | United States |  |
| MKL | Jackson |  | United States |  |
| JAC | Jackson Hole |  | United States |  |
| JXN | Jackson, MI |  | United States | + |
| CRG | Jacksonville |  | United States | + |
| JAX | Jacksonville |  | United States |  |
| NIP | Jacksonville |  | United States | + |
| NRB | Jacksonville |  | United States | + |
| VQQ | Jacksonville |  | United States | + |
| LRF | Jacksonville, AR |  | United States | + |
| JMS | Jamestown |  | United States |  |
| JHW | Jamestown, NY |  | United States | + |
| JST | Johnstown |  | United States |  |
| JBR | Jonesboro |  | United States |  |
| JLN | Joplin |  | United States |  |
| JCT | Junction |  | United States | + |
| JNU | Juneau |  | United States |  |
| KAE | Kake |  | United States |  |
| AZO | Kalamazoo |  | United States |  |
| LUP | Kalaupapa |  | United States |  |
| FCA | Kalispell |  | United States |  |
| KLG | Kalskag |  | United States |  |
| KAL | Kaltag |  | United States |  |
| NGF | Kaneohe |  | United States | + |
| IKK | Kankakee |  | United States | + |
| MCI | Kansas City |  | United States |  |
| MKC | Kansas City |  | United States | + |
| JRF | Kapolei |  | United States |  |
| KYK | Karluk |  | United States |  |
| KXA | Kasaan |  | United States |  |
| KUK | Kasigluk |  | United States |  |
| BKF | Katmai National Park |  | United States |  |
| MKK | Kaunakakai |  | United States |  |
| EAR | Kearney |  | United States |  |
| EEN | Keene |  | United States | + |
| BKH | Kekaha |  | United States |  |
| KLS | Kelso |  | United States | + |
| ENA | Kenai |  | United States |  |
| KEH | Kenmore |  | United States |  |
| ENW | Kenosha |  | United States | + |
| KTN | Ketchikan |  | United States |  |
| WFB | Ketchikan |  | United States |  |
| OCA | Key Largo |  | United States | + |
| EYW | Key West |  | United States |  |
| NQX | Key West |  | United States | + |
| IAN | Kiana |  | United States |  |
| KVC | King Cove |  | United States |  |
| AKN | King Salmon |  | United States |  |
| IGM | Kingman |  | United States | + |
| NQI | Kingsville |  | United States | + |
| ISO | Kinston |  | United States | + |
| KPN | Kipnuk |  | United States |  |
| IRK | Kirksville |  | United States |  |
| ISM | Kissimmee |  | United States | + |
| KKB | Kitoi Bay |  | United States |  |
| KVL | Kivalina |  | United States |  |
| LMT | Klamath Falls |  | United States | + |
| KLW | Klawock |  | United States |  |
| SZL | Knob Noster |  | United States | + |
| TYS | Knoxville |  | United States |  |
| OBU | Kobuk |  | United States |  |
| ADQ | Kodiak |  | United States |  |
| KNK | Kokhanok |  | United States |  |
| KGK | Koliganek |  | United States |  |
| KOA | Kona |  | United States |  |
| KKH | Kongiganak |  | United States |  |
| KOT | Kotlik |  | United States |  |
| OTZ | Kotzebue |  | United States |  |
| KKA | Koyuk |  | United States |  |
| KYU | Koyukuk |  | United States |  |
| KWT | Kwethluk |  | United States |  |
| KWK | Kwigillingok |  | United States |  |
| LSE | La Crosse |  | United States |  |
| LFT | Lafayette |  | United States |  |
| JHM | Lahaina |  | United States |  |
| LCH | Lake Charles |  | United States |  |
| HII | Lake Havasu City |  | United States |  |
| NEL | Lakehurst |  | United States | + |
| LAL | Lakeland |  | United States |  |
| LAA | Lamar |  | United States | + |
| LNY | Lanai City |  | United States |  |
| LNS | Lancaster |  | United States |  |
| WJF | Lancaster, CA |  | United States | + |
| LND | Lander |  | United States | + |
| LAN | Lansing |  | United States |  |
| LAR | Laramie |  | United States |  |
| LRD | Laredo |  | United States |  |
| KLN | Larsen Bay |  | United States |  |
| LRU | Las Cruces |  | United States |  |
| LAS | Las Vegas |  | United States |  |
| LSV | Las Vegas |  | United States | + |
| VGT | Las Vegas |  | United States | + |
| LVS | Las Vegas, NM |  | United States | + |
| LBE | Latrobe |  | United States |  |
| LWM | Lawrence |  | United States | + |
| LAW | Lawton |  | United States |  |
| ALZ | Lazy Bay |  | United States |  |
| LEB | Lebanon |  | United States |  |
| LEE | Leesburg |  | United States | + |
| NLC | Lemoore |  | United States | + |
| KLL | Levelock |  | United States | + |
| LWB | Lewisburg |  | United States |  |
| LWS | Lewiston |  | United States |  |
| LWT | Lewistown |  | United States | + |
| LEX | Lexington |  | United States |  |
| LBL | Liberal |  | United States |  |
| LIH | Lihue |  | United States |  |
| LNK | Lincoln |  | United States |  |
| LIT | Little Rock |  | United States |  |
| LVM | Livingston |  | United States | + |
| LGU | Logan |  | United States | + |
| VBG | Lompoc |  | United States | + |
| LOZ | London, KY |  | United States | + |
| LGB | Long Beach |  | United States |  |
| ISP | Long Island |  | United States |  |
| GGG | Longview |  | United States |  |
| LPS | Lopez |  | United States |  |
| LAX | Los Angeles |  | United States |  |
| LOU | Louisville |  | United States | + |
| SDF | Louisville |  | United States |  |
| FNL | Loveland |  | United States | + |
| LOL | Lovelock |  | United States | + |
| LBB | Lubbock |  | United States |  |
| LFK | Lufkin |  | United States | + |
| LBT | Lumberton |  | United States | + |
| LYH | Lynchburg |  | United States |  |
| MCN | Macon |  | United States |  |
| MSN | Madison |  | United States |  |
| MMH | Mammoth Lakes |  | United States |  |
| MNZ | Manassas |  | United States | + |
| MHT | Manchester |  | United States |  |
| MHK | Manhattan |  | United States |  |
| MBL | Manistee |  | United States |  |
| MLY | Manley Hot Springs |  | United States |  |
| KMO | Manokotak |  | United States |  |
| MFD | Mansfield |  | United States | + |
| MTH | Marathon, FL |  | United States | + |
| MGE | Marietta |  | United States | + |
| MWA | Marion |  | United States |  |
| MQT | Marquette |  | United States |  |
| MLL | Marshall |  | United States |  |
| MVY | Martha's Vineyard |  | United States |  |
| MRB | Martinsburg |  | United States | + |
| BAB | Marysville |  | United States | + |
| MYV | Marysville |  | United States | + |
| MCW | Mason City |  | United States |  |
| MSS | Massena |  | United States |  |
| OGG | Maui |  | United States |  |
| MYK | May Creek |  | United States |  |
| MLC | McAlester |  | United States | + |
| MFE | McAllen |  | United States |  |
| MYL | McCall |  | United States |  |
| MCB | McComb |  | United States | + |
| MCK | McCook |  | United States |  |
| MCG | McGrath |  | United States |  |
| MFR | Medford |  | United States |  |
| MYU | Mekoryuk |  | United States |  |
| MLB | Melbourne |  | United States |  |
| MEM | Memphis |  | United States |  |
| MCE | Merced |  | United States |  |
| MER | Merced |  | United States | + |
| DRA | Mercury |  | United States | + |
| MEI | Meridian |  | United States |  |
| WWT | Mertarvik |  | United States |  |
| MFH | Mesquite |  | United States | + |
| ANN | Metlakatla |  | United States | + |
| MTM | Metlakatla |  | United States |  |
| WMK | Meyers Chuck |  | United States | + |
| MIA | Miami |  | United States |  |
| OPF | Miami |  | United States |  |
| TMB | Miami |  | United States | + |
| MGC | Michigan City |  | United States |  |
| MAF | Midland |  | United States |  |
| MLS | Miles City |  | United States | + |
| NQA | Millington |  | United States | + |
| MIV | Millville |  | United States | + |
| NSE | Milton |  | United States | + |
| MKE | Milwaukee |  | United States |  |
| LMA | Minchumina |  | United States |  |
| MWL | Mineral Wells |  | United States |  |
| MSP | Minneapolis |  | United States |  |
| MIB | Minot |  | United States | + |
| MOT | Minot |  | United States |  |
| MNT | Minto |  | United States |  |
| MSO | Missoula |  | United States |  |
| CNY | Moab |  | United States |  |
| BFM | Mobile |  | United States | + |
| MOB | Mobile |  | United States |  |
| MBG | Mobridge |  | United States | + |
| MOD | Modesto |  | United States | + |
| MHV | Mojave |  | United States | + |
| HDH | Mokuleia |  | United States |  |
| MLI | Moline |  | United States |  |
| MLU | Monroe |  | United States |  |
| MTP | Montauk |  | United States |  |
| MRY | Monterey |  | United States |  |
| MGM | Montgomery |  | United States |  |
| MXF | Montgomery |  | United States | + |
| MTJ | Montrose |  | United States |  |
| MGW | Morgantown |  | United States |  |
| MMU | Morristown |  | United States | + |
| KMY | Moser Bay |  | United States |  |
| MWH | Moses Lake |  | United States | + |
| CWA | Mosinee |  | United States |  |
| MTC | Mount Clemens |  | United States | + |
| WMH | Mountain Home, AR |  | United States | + |
| MUO | Mountain Home, ID |  | United States | + |
| NUQ | Mountain View |  | United States | + |
| MOU | Mountain Village |  | United States |  |
| MIE | Muncie |  | United States | + |
| MSL | Muscle Shoals |  | United States |  |
| MKG | Muskegon |  | United States |  |
| MYR | Myrtle Beach |  | United States |  |
| ACK | Nantucket |  | United States |  |
| KEB | Nanwalek |  | United States |  |
| APC | Napa |  | United States | + |
| WNA | Napakiak |  | United States |  |
| PKA | Napaskiak |  | United States |  |
| APF | Naples |  | United States | + |
| BNA | Nashville |  | United States |  |
| HEZ | Natchez |  | United States | + |
| EED | Needles |  | United States | + |
| NLG | Nelson Lagoon |  | United States |  |
| ENN | Nenana |  | United States | + |
| EWB | New Bedford |  | United States |  |
| EWN | New Bern |  | United States |  |
| HVN | New Haven |  | United States |  |
| ARA | New Iberia |  | United States | + |
| MSY | New Orleans | La Nouvelle-Orléans | United States |  |
| NBG | New Orleans | La Nouvelle-Orléans | United States | + |
| NEW | New Orleans | La Nouvelle-Orléans | United States | + |
| RNH | New Richmond |  | United States | + |
| KNW | New Stuyahok |  | United States |  |
| JRA | New York |  | United States |  |
| NYS | New York |  | United States |  |
| TSS | New York |  | United States |  |
| JFK | New York · Kennedy |  | United States |  |
| LGA | New York · LaGuardia |  | United States |  |
| EWR | Newark |  | United States |  |
| SWF | Newburgh |  | United States |  |
| NPT | Newport |  | United States |  |
| FAF | Newport News |  | United States | + |
| PHF | Newport News |  | United States |  |
| ONP | Newport, OR |  | United States | + |
| IAG | Niagara Falls |  | United States |  |
| NME | Nightmute |  | United States |  |
| NIB | Nikolai |  | United States |  |
| IKO | Nikolski |  | United States |  |
| WTK | Noatak |  | United States |  |
| OLS | Nogales, AZ |  | United States | + |
| OME | Nome |  | United States |  |
| NNL | Nondalton |  | United States | + |
| ORV | Noorvik |  | United States |  |
| NGU | Norfolk |  | United States | + |
| ORF | Norfolk |  | United States |  |
| OFK | Norfolk, NE |  | United States | + |
| OTH | North Bend |  | United States |  |
| NCO | North Kingstown |  | United States | + |
| CRE | North Myrtle Beach |  | United States | + |
| LBF | North Platte |  | United States |  |
| ORT | Northway |  | United States |  |
| OWD | Norwood |  | United States | + |
| NUI | Nuiqsut |  | United States |  |
| NUL | Nulato |  | United States |  |
| SXP | Nunam Iqua |  | United States |  |
| NUP | Nunapitchuk |  | United States |  |
| NUW | Oak Harbor |  | United States | + |
| OAK | Oakland |  | United States |  |
| OCE | Ocean City |  | United States |  |
| OCN | Oceanside |  | United States | + |
| HIF | Ogden |  | United States | + |
| OGD | Ogden |  | United States |  |
| OGS | Ogdensburg |  | United States |  |
| OKC | Oklahoma City |  | United States |  |
| TIK | Oklahoma City |  | United States | + |
| OLH | Old Harbor |  | United States |  |
| KOY | Olga Bay |  | United States |  |
| OLM | Olympia |  | United States |  |
| OFF | Omaha |  | United States | + |
| OMA | Omaha |  | United States |  |
| ONT | Ontario |  | United States |  |
| ONO | Ontario, OR |  | United States | + |
| SNA | Orange County |  | United States |  |
| OGB | Orangeburg |  | United States | + |
| MCO | Orlando |  | United States |  |
| ORL | Orlando |  | United States | + |
| SFB | Orlando |  | United States |  |
| OSH | Oshkosh |  | United States | + |
| OTM | Ottumwa |  | United States | + |
| KOZ | Ouzinkie |  | United States |  |
| OWB | Owensboro |  | United States |  |
| UOX | Oxford, MS |  | United States | + |
| OXR | Oxnard |  | United States | + |
| PAH | Paducah |  | United States |  |
| PGA | Page |  | United States |  |
| PSP | Palm Springs |  | United States |  |
| PMD | Palmdale |  | United States | + |
| PAQ | Palmer |  | United States | + |
| PAO | Palo Alto |  | United States | + |
| ECP | Panama City Beach |  | United States |  |
| PAM | Panama City, FL |  | United States | + |
| PRX | Paris, TX |  | United States | + |
| PKB | Parkersburg |  | United States |  |
| PRB | Paso Robles |  | United States | + |
| NHK | Patuxent River |  | United States | + |
| PDB | Pedro Bay |  | United States |  |
| PEC | Pelican |  | United States |  |
| PLN | Pellston |  | United States |  |
| PDT | Pendleton |  | United States |  |
| NPA | Pensacola |  | United States | + |
| PNS | Pensacola |  | United States |  |
| PIA | Peoria |  | United States |  |
| KPV | Perryville |  | United States |  |
| PSG | Petersburg |  | United States |  |
| PHL | Philadelphia | Philadelphie | United States |  |
| PNE | Philadelphia | Philadelphie | United States | + |
| AZA | Phoenix |  | United States |  |
| PHX | Phoenix |  | United States |  |
| PIR | Pierre |  | United States |  |
| PIP | Pilot Point |  | United States |  |
| PQS | Pilot Station |  | United States |  |
| PBF | Pine Bluff |  | United States | + |
| PWY | Pinedale |  | United States | + |
| AGC | Pittsburgh |  | United States | + |
| PIT | Pittsburgh |  | United States |  |
| PTU | Platinum |  | United States |  |
| PBG | Plattsburgh |  | United States |  |
| PIH | Pocatello |  | United States |  |
| KPB | Point Baker |  | United States |  |
| PHO | Point Hope |  | United States |  |
| PIZ | Point Lay |  | United States |  |
| NTD | Point Mugu |  | United States | + |
| PNC | Ponca City |  | United States | + |
| PTK | Pontiac |  | United States | + |
| PTD | Port Alexander |  | United States |  |
| PTA | Port Alsworth |  | United States |  |
| CLM | Port Angeles |  | United States | + |
| KPY | Port Bailey |  | United States |  |
| KPC | Port Clarence |  | United States | + |
| PGM | Port Graham |  | United States |  |
| PTH | Port Heiden |  | United States |  |
| ORI | Port Lions |  | United States |  |
| PPV | Port Protection |  | United States |  |
| KPR | Port Williams |  | United States |  |
| HIO | Portland |  | United States | + |
| PDX | Portland |  | United States |  |
| PWM | Portland |  | United States |  |
| TTD | Portland |  | United States | + |
| PSM | Portsmouth |  | United States |  |
| POU | Poughkeepsie |  | United States | + |
| PRC | Prescott |  | United States |  |
| PQI | Presque Isle |  | United States |  |
| PVD | Providence |  | United States |  |
| PVC | Provincetown |  | United States |  |
| PVU | Provo |  | United States |  |
| PUB | Pueblo |  | United States |  |
| PUW | Pullman |  | United States |  |
| PGD | Punta Gorda |  | United States |  |
| NYG | Quantico |  | United States | + |
| UIN | Quincy |  | United States |  |
| KWN | Quinhagak |  | United States |  |
| RDU | Raleigh |  | United States |  |
| RMP | Rampart |  | United States |  |
| RAP | Rapid City |  | United States |  |
| RCA | Rapid City |  | United States | + |
| RWL | Rawlins |  | United States | + |
| RDG | Reading |  | United States | + |
| RBL | Red Bluff |  | United States | + |
| RDV | Red Devil |  | United States |  |
| RDD | Redding |  | United States |  |
| RDM | Redmond |  | United States |  |
| RWF | Redwood Falls |  | United States | + |
| RNO | Reno |  | United States |  |
| RHI | Rhinelander |  | United States |  |
| OAJ | Richlands |  | United States |  |
| RIC | Richmond |  | United States |  |
| RIL | Rifle |  | United States | + |
| RAL | Riverside |  | United States | + |
| RIV | Riverside |  | United States | + |
| RIW | Riverton |  | United States |  |
| ROA | Roanoke |  | United States |  |
| RCE | Roche Harbor |  | United States |  |
| ROC | Rochester |  | United States |  |
| RST | Rochester |  | United States |  |
| RKS | Rock Springs |  | United States |  |
| RFD | Rockford |  | United States |  |
| RKD | Rockland |  | United States |  |
| RWI | Rocky Mount |  | United States | + |
| RMG | Rome, GA |  | United States | + |
| RME | Rome, NY |  | United States | + |
| RSJ | Rosario |  | United States |  |
| ROW | Roswell |  | United States |  |
| RBY | Ruby |  | United States |  |
| RUI | Ruidoso |  | United States | + |
| RSL | Russell |  | United States | + |
| RSH | Russian Mission |  | United States |  |
| RUT | Rutland |  | United States |  |
| MCC | Sacramento |  | United States | + |
| MHR | Sacramento |  | United States | + |
| SAC | Sacramento |  | United States | + |
| SMF | Sacramento |  | United States |  |
| MBS | Saginaw |  | United States |  |
| STC | Saint Cloud |  | United States |  |
| STP | Saint Paul |  | United States | + |
| SLE | Salem |  | United States |  |
| SLN | Salina |  | United States |  |
| SNS | Salinas, CA |  | United States | + |
| SBY | Salisbury |  | United States |  |
| SMN | Salmon |  | United States |  |
| SLC | Salt Lake City |  | United States |  |
| SJT | San Angelo |  | United States |  |
| SAT | San Antonio |  | United States |  |
| SKF | San Antonio |  | United States | + |
| SSF | San Antonio |  | United States | + |
| SBD | San Bernardino |  | United States |  |
| SQL | San Carlos |  | United States |  |
| NKX | San Diego |  | United States | + |
| NZY | San Diego |  | United States | + |
| SAN | San Diego |  | United States |  |
| SDM | San Diego |  | United States | + |
| SFO | San Francisco |  | United States |  |
| SJC | San Jose |  | United States |  |
| UGI | San Juan |  | United States |  |
| SBP | San Luis Obispo |  | United States |  |
| SDP | Sand Point |  | United States |  |
| SBA | Santa Barbara |  | United States |  |
| SAF | Santa Fe |  | United States |  |
| SMX | Santa Maria |  | United States |  |
| SMO | Santa Monica |  | United States | + |
| STS | Santa Rosa |  | United States |  |
| SLK | Saranac Lake |  | United States |  |
| SRQ | Sarasota |  | United States |  |
| CIU | Sault Ste. Marie MI |  | United States |  |
| SAV | Savannah |  | United States |  |
| SVN | Savannah |  | United States | + |
| SVA | Savoonga |  | United States |  |
| SCM | Scammon Bay |  | United States |  |
| SCH | Schenectady |  | United States | + |
| BFF | Scottsbluff |  | United States |  |
| SYB | Seal Bay |  | United States |  |
| LKE | Seattle |  | United States |  |
| BFI | Seattle · Boeing Field |  | United States |  |
| SEA | Seattle · Sea-Tac |  | United States |  |
| WLK | Selawik |  | United States |  |
| SOV | Seldovia |  | United States |  |
| SWD | Seward |  | United States | + |
| SHX | Shageluk |  | United States | + |
| SKK | Shaktoolik |  | United States |  |
| SYA | Shemya |  | United States | + |
| SHR | Sheridan |  | United States |  |
| SHH | Shishmaref |  | United States |  |
| SOW | Show Low |  | United States |  |
| SHV | Shreveport |  | United States |  |
| SHG | Shungnak |  | United States |  |
| SDY | Sidney |  | United States |  |
| SNY | Sidney, NE |  | United States | + |
| FHU | Sierra Vista |  | United States | + |
| SVC | Silver City |  | United States |  |
| SUX | Sioux City |  | United States |  |
| FSD | Sioux Falls |  | United States |  |
| SIT | Sitka |  | United States |  |
| SGY | Skagway |  | United States |  |
| SLQ | Sleetmute |  | United States |  |
| MQY | Smyrna |  | United States | + |
| SXQ | Soldotna |  | United States | + |
| SME | Somerset |  | United States | + |
| SBN | South Bend |  | United States |  |
| TVL | South Lake Tahoe |  | United States | + |
| WSN | South Naknek |  | United States |  |
| SVW | Sparrevohn |  | United States | + |
| GEG | Spokane |  | United States |  |
| SFF | Spokane |  | United States | + |
| SKA | Spokane |  | United States | + |
| SGF | Springfield |  | United States |  |
| SPI | Springfield |  | United States |  |
| SGH | Springfield, OH |  | United States | + |
| UST | St Augustine |  | United States |  |
| SGU | St George |  | United States |  |
| STG | St George |  | United States |  |
| STJ | St Joseph |  | United States | + |
| ALN | St Louis |  | United States | + |
| STL | St Louis |  | United States |  |
| SUS | St Louis |  | United States | + |
| KSM | St Mary's |  | United States |  |
| SMK | St Michael |  | United States |  |
| SNP | St Paul Island |  | United States |  |
| PIE | St Pete |  | United States |  |
| SSI | St Simons Island |  | United States | + |
| SCE | State College |  | United States |  |
| WBB | Stebbins |  | United States |  |
| SVS | Stevens Village |  | United States |  |
| SWO | Stillwater |  | United States |  |
| SCK | Stockton |  | United States |  |
| SRV | Stony River |  | United States |  |
| SUA | Stuart |  | United States | + |
| SGR | Sugar Land |  | United States | + |
| SSC | Sumter |  | United States | + |
| SUN | Sun Valley |  | United States |  |
| SYR | Syracuse |  | United States |  |
| TCM | Tacoma |  | United States | + |
| TIW | Tacoma |  | United States |  |
| TCT | Takotna |  | United States |  |
| TLJ | Takotna |  | United States | + |
| TKA | Talkeetna |  | United States | + |
| TLH | Tallahassee |  | United States |  |
| MCF | Tampa |  | United States | + |
| TPA | Tampa |  | United States |  |
| TAL | Tanana |  | United States |  |
| TSM | Taos |  | United States |  |
| TEK | Tatitlek |  | United States |  |
| TLA | Teller |  | United States |  |
| TEX | Telluride |  | United States |  |
| TPL | Temple |  | United States | + |
| TKE | Tenakee Springs |  | United States |  |
| HUF | Terre Haute |  | United States | + |
| TEB | Teterboro |  | United States |  |
| TXK | Texarkana |  | United States |  |
| DLS | The Dalles |  | United States | + |
| TRM | Thermal |  | United States | + |
| TVF | Thief River Falls |  | United States |  |
| KTB | Thorne Bay |  | United States |  |
| TNC | Tin City |  | United States |  |
| TIX | Titusville |  | United States | + |
| TOG | Togiak Village |  | United States |  |
| TKJ | Tok |  | United States |  |
| OOK | Toksook Bay |  | United States |  |
| TOL | Toledo |  | United States |  |
| TPH | Tonopah |  | United States | + |
| FOE | Topeka |  | United States | + |
| TOP | Topeka |  | United States | + |
| TVC | Traverse City |  | United States |  |
| TTN | Trenton |  | United States |  |
| PSC | Tri-Cities |  | United States |  |
| TRI | Tri-Cities |  | United States |  |
| TOI | Troy |  | United States | + |
| TKF | Truckee |  | United States |  |
| TCS | Truth or Consequences |  | United States | + |
| DMA | Tucson |  | United States | + |
| TUS | Tucson |  | United States |  |
| TCC | Tucumcari |  | United States | + |
| RVS | Tulsa |  | United States | + |
| TUL | Tulsa |  | United States |  |
| TLT | Tuluksak |  | United States |  |
| WTL | Tuntutuliak |  | United States |  |
| TNK | Tununak |  | United States |  |
| TUP | Tupelo |  | United States |  |
| TCL | Tuscaloosa |  | United States | + |
| NKI | Tuxekan Island |  | United States |  |
| TWF | Twin Falls |  | United States |  |
| TWA | Twin Hills |  | United States |  |
| TYR | Tyler |  | United States |  |
| UKI | Ukiah |  | United States | + |
| UNK | Unalakleet |  | United States |  |
| DUT | Unalaska |  | United States |  |
| RND | Universal City |  | United States | + |
| UTO | Utopia Creek |  | United States |  |
| BRW | Utqiaġvik |  | United States |  |
| VDZ | Valdez |  | United States |  |
| VAD | Valdosta |  | United States | + |
| VLD | Valdosta |  | United States |  |
| VTN | Valentine |  | United States | + |
| VPZ | Valparaiso |  | United States | + |
| VNY | Van Nuys |  | United States | + |
| VEE | Venetie |  | United States |  |
| VEL | Vernal |  | United States |  |
| VRB | Vero Beach |  | United States |  |
| VCT | Victoria |  | United States |  |
| NTU | Virginia Beach |  | United States | + |
| VIS | Visalia |  | United States | + |
| ACT | Waco |  | United States |  |
| MUE | Waimea |  | United States |  |
| AIN | Wainwright |  | United States |  |
| WAA | Wales |  | United States |  |
| ALW | Walla Walla |  | United States |  |
| WRB | Warner Robins |  | United States | + |
| IAD | Washington · Dulles |  | United States |  |
| DCA | Washington · Reagan National |  | United States |  |
| WWA | Wasilla |  | United States | + |
| ALO | Waterloo |  | United States |  |
| ART | Watertown |  | United States |  |
| ATY | Watertown |  | United States |  |
| AUW | Wausau |  | United States | + |
| EAT | Wenatchee |  | United States |  |
| ENV | Wendover |  | United States | + |
| DPA | West Chicago |  | United States | + |
| LAF | West Lafayette |  | United States |  |
| DJT | West Palm Beach |  | United States |  |
| PBI | West Palm Beach |  | United States |  |
| KWP | West Point |  | United States |  |
| WSX | West Sound |  | United States |  |
| WYS | West Yellowstone |  | United States |  |
| WST | Westerly |  | United States |  |
| BAF | Westfield |  | United States | + |
| SHD | Weyers Cave |  | United States |  |
| WWP | Whale Pass |  | United States |  |
| HLG | Wheeling |  | United States | + |
| WMO | White Mountain |  | United States |  |
| HPN | White Plains |  | United States |  |
| IAB | Wichita |  | United States | + |
| ICT | Wichita |  | United States |  |
| SPS | Wichita Falls |  | United States |  |
| WWD | Wildwood |  | United States | + |
| AVP | Wilkes-Barre |  | United States |  |
| IPT | Williamsport |  | United States |  |
| XWA | Williston |  | United States |  |
| ILG | Wilmington |  | United States |  |
| ILM | Wilmington |  | United States |  |
| ILN | Wilmington, OH |  | United States | + |
| INK | Wink |  | United States | + |
| WMC | Winnemucca |  | United States | + |
| INW | Winslow |  | United States | + |
| INT | Winston-Salem |  | United States | + |
| OLF | Wolf Point |  | United States |  |
| WWR | Woodward |  | United States | + |
| ORH | Worcester |  | United States |  |
| WRL | Worland |  | United States | + |
| WRG | Wrangell |  | United States |  |
| WRI | Wrightstown |  | United States | + |
| CYT | Yakataga |  | United States |  |
| YKM | Yakima |  | United States |  |
| YAK | Yakutat |  | United States |  |
| YKN | Yankton |  | United States | + |
| YNG | Youngstown |  | United States | + |
| YUM | Yuma |  | United States |  |
| KZB | Zachar Bay |  | United States |  |
| ZZV | Zanesville |  | United States | + |
| DZO | Durazno |  | Uruguay | + |
| MVD | Montevideo |  | Uruguay |  |
| PDU | Paysandú |  | Uruguay | + |
| PDP | Punta del Este |  | Uruguay | + |
| RVY | Rivera |  | Uruguay | + |
| STY | Salto |  | Uruguay | + |
| AGV | Acarigua |  | Venezuela | + |
| AAO | Anaco |  | Venezuela | + |
| BLA | Barcelona, Venezuela |  | Venezuela | + |
| BNS | Barinas |  | Venezuela | + |
| BRM | Barquisimeto |  | Venezuela | + |
| CXA | Caicara del Orinoco |  | Venezuela | + |
| CLZ | Calabozo |  | Venezuela | + |
| CAJ | Canaima |  | Venezuela | + |
| CCS | Caracas |  | Venezuela |  |
| CUP | Carúpano |  | Venezuela | + |
| CBL | Ciudad Bolívar |  | Venezuela | + |
| CZE | Coro |  | Venezuela | + |
| CUM | Cumaná |  | Venezuela | + |
| EOR | El Dorado, Venezuela |  | Venezuela | + |
| SOM | El Tigre |  | Venezuela | + |
| VIG | El Vigía |  | Venezuela | + |
| EOZ | Elorza |  | Venezuela | + |
| LRV | Gran Roque Island |  | Venezuela | + |
| GUQ | Guanare |  | Venezuela | + |
| GDO | Guasdualito |  | Venezuela | + |
| GUI | Güiria |  | Venezuela | + |
| ICC | Isla de Coche |  | Venezuela | + |
| LFR | La Fría |  | Venezuela | + |
| MAR | Maracaibo |  | Venezuela |  |
| MYC | Maracay |  | Venezuela | + |
| PMV | Margarita |  | Venezuela | + |
| MUN | Maturín |  | Venezuela | + |
| MRD | Mérida, Venezuela |  | Venezuela | + |
| PTM | Palmarito |  | Venezuela | + |
| PYH | Puerto Ayacucho |  | Venezuela | + |
| PBL | Puerto Cabello |  | Venezuela | + |
| PZO | Puerto Ordaz |  | Venezuela | + |
| LSP | Punto Fijo |  | Venezuela | + |
| SVZ | San Antonio del Táchira |  | Venezuela | + |
| STB | San Carlos del Zulia |  | Venezuela | + |
| SCI | San Cristóbal, Venezuela |  | Venezuela | + |
| SNF | San Felipe |  | Venezuela | + |
| SFD | San Fernando de Apure |  | Venezuela | + |
| SNV | Santa Elena de Uairén |  | Venezuela | + |
| STD | Santo Domingo, Venezuela |  | Venezuela | + |
| TUV | Tucupita |  | Venezuela | + |
| TMO | Tumeremo |  | Venezuela | + |
| VLN | Valencia, Venezuela |  | Venezuela | + |
| VLV | Valera |  | Venezuela | + |
| VDP | Valle de la Pascua |  | Venezuela | + |
