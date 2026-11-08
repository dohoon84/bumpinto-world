[out:json][timeout:120];
node["railway"="subway_entrance"](37.355,127.075,37.52,127.145)->.e;
(
  way(bn.e);
  way(around.e:30)["highway"~"steps|footway|corridor|elevator"];
  way(around.e:40)["man_made"="bridge"];
  way(around.e:40)["bridge"]["highway"];
)->.w;
.w out geom;
