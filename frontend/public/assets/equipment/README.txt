T1 SCADA equipment sprites
==========================

Drop the six isometric PNG renders in THIS folder with these exact filenames.
They are referenced by frontend/src/components/chiller/equipmentImages.ts and
served by Vite at /assets/equipment/<name>.png

Required files (transparent-background PNG, roughly square):

  chiller.png          - water-cooled screw chiller (beige)         -> chillers CH-1..5
  cooling-tower.png    - cooling tower with top fan (blue)          -> towers CT-01..05
  pump-vertical.png    - vertical inline pump (grey)                -> chilled-water pumps CHWP + make-up pumps
  pump-horizontal.png  - horizontal end-suction pump (green motor)  -> condenser-water pumps CWP
  valve.png            - actuated valve on blue pipe                -> bypass valves BV-1/2
  tank.png             - vertical vessel on legs                    -> expansion tanks + make-up tank

Until the files are present the schematic will render the equipment boxes empty
(labels, status dots and pipes still work). No rebuild is needed after adding
them in dev mode; for a production build, run `npm run build` again.
