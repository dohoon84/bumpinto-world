[out:json][timeout:120];
(
  node["railway"="subway_entrance"](37.355,127.075,37.52,127.145);
  node["railway"="station"](37.355,127.075,37.52,127.145);
  node["public_transport"="station"](37.355,127.075,37.52,127.145);
  node["railway"="stop"](37.355,127.075,37.52,127.145);
  node["public_transport"="stop_position"]["train"="yes"](37.355,127.075,37.52,127.145);
  node["public_transport"="stop_position"]["subway"="yes"](37.355,127.075,37.52,127.145);
)->.n;
.n out body;
rel(bn.n)["route"~"subway|train|light_rail"];
out body;
