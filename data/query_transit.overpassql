[out:json][timeout:180][bbox:37.3580,127.1015,37.3720,127.1151];
(
  relation["route"="bus"];
  node["highway"="bus_stop"];
  node["public_transport"~"platform|stop_position"];
  way["public_transport"="platform"];
  node["highway"="crossing"];
  node["highway"="traffic_signals"];
  node["crossing"];
);
out body geom;
