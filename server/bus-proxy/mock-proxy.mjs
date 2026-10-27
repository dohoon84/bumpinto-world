// 로컬 테스트용 가짜 프록시 (실제 API 호출 없음). node server/bus-proxy/mock-proxy.mjs -> http://localhost:8799
import http from 'node:http';
const station = { response: { msgHeader: { resultCode: 0 }, msgBody: { busStationList: [{ stationId: 206000999, mobileNo: '07624', stationName: '정자역(목업)' }] } } };
const arrivals = { response: { msgHeader: { resultCode: 0 }, msgBody: { busArrivalList: [
  { routeName: '1303', routeTypeCd: 11, predictTimeSec1: 95, locationNo1: 2, remainSeatCnt1: 12 },
  { routeName: 'M4102', routeTypeCd: 14, predictTimeSec1: 410, locationNo1: 5, remainSeatCnt1: 30 },
  { routeName: '8100', routeTypeCd: 11, predictTimeSec1: 30, locationNo1: 1, remainSeatCnt1: 3 },
] } } };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/stations') return res.end(JSON.stringify(station));
  if (u.pathname === '/arrivals') return res.end(JSON.stringify(arrivals));
  res.statusCode = 404; res.end('{}');
}).listen(8799, () => console.log('mock proxy http://localhost:8799'));
