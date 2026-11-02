package dev.finoscore;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.math.*;
import java.util.*;

@Service
public class MarketService {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private volatile String lastError;
    @org.springframework.beans.factory.annotation.Value("${finos.market-enabled:true}") private boolean enabled;
    public MarketService(JdbcTemplate db,ObjectMapper json) { this.db=db;this.json=json; }
    @Scheduled(fixedDelay=3600000,initialDelay=1000)
    public void refresh() {
        if(!enabled) return;
        // Cache across restarts, respecting the provider's daily update cadence.
        Integer recent=db.queryForObject("SELECT count(*) FROM market_snapshots WHERE provider='ExchangeRate-API' AND fetched_at>now()-interval '1 hour'",Integer.class);
        if(recent>0) return;
        try {
            var request=HttpRequest.newBuilder(URI.create("https://open.er-api.com/v6/latest/USD")).timeout(Duration.ofSeconds(10)).GET().build();
            var response=client.send(request,HttpResponse.BodyHandlers.ofString());
            JsonNode root=json.readTree(response.body());
            if(response.statusCode()!=200 || !"success".equals(root.path("result").asText())) throw new IllegalStateException("Provider rejected request");
            for(String c:List.of("INR","EUR","GBP")) if(root.path("rates").path(c).decimalValue().signum()<=0) throw new IllegalStateException("Invalid provider rate");
            long stamp=root.path("time_last_update_unix").asLong();
            if(stamp<=0 || Instant.ofEpochSecond(stamp).isAfter(Instant.now().plusSeconds(300))) throw new IllegalStateException("Invalid provider timestamp");
            db.update("INSERT INTO market_snapshots(provider,payload) VALUES ('ExchangeRate-API',?::jsonb) ON CONFLICT(provider) DO UPDATE SET payload=EXCLUDED.payload,fetched_at=now()",response.body());
            lastError=null;
        } catch(Exception e) { lastError="Provider unavailable; any retained quote is explicitly marked with its age"; }
    }
    private JsonNode snapshot() {
        var rows=db.queryForList("SELECT payload::text FROM market_snapshots WHERE provider='ExchangeRate-API'");
        if(rows.isEmpty()) throw LedgerService.fail(503,"FX provider unavailable. INR transfers remain available.");
        try { return json.readTree(rows.getFirst().get("payload").toString()); } catch(Exception e) { throw new IllegalStateException(e); }
    }
    public Map<String,Object> market() {
        try {
            JsonNode data=snapshot();
            Instant stamp=Instant.ofEpochSecond(data.path("time_last_update_unix").asLong());
            long age=Duration.between(stamp,Instant.now()).getSeconds();
            BigDecimal inr=data.path("rates").path("INR").decimalValue();
            Map<String,String> rates=new LinkedHashMap<>(); rates.put("USD",inr.toPlainString());
            rates.put("EUR",inr.divide(data.path("rates").path("EUR").decimalValue(),10,RoundingMode.HALF_EVEN).toPlainString());
            rates.put("GBP",inr.divide(data.path("rates").path("GBP").decimalValue(),10,RoundingMode.HALF_EVEN).toPlainString());
            return Map.of("available",true,"provider","ExchangeRate-API","providerUrl","https://www.exchangerate-api.com","frequency","Daily reference rates; not executable interbank prices","asOf",stamp.toString(),"ageSeconds",age,"stale",age>172800,"ratesToInr",rates,"lastError",Objects.toString(lastError,""));
        } catch(org.springframework.web.server.ResponseStatusException e) { return Map.of("available",false,"stale",true,"lastError",e.getReason()); }
    }
    @SuppressWarnings("unchecked") public Map<String,Object> quote(String currency,String originalAmount) {
        if(!Set.of("USD","EUR","GBP").contains(currency)) throw LedgerService.fail(400,"FX quotes support USD, EUR and GBP");
        long amount=LedgerService.minor(originalAmount);
        Map<String,Object> market=market();
        if(!Boolean.TRUE.equals(market.get("available")) || Boolean.TRUE.equals(market.get("stale"))) throw LedgerService.fail(503,"Fresh reference FX data is unavailable; use INR or retry later");
        BigDecimal rate=new BigDecimal(((Map<String,String>)market.get("ratesToInr")).get(currency));
        long converted;
        try { converted=rate.multiply(BigDecimal.valueOf(amount)).setScale(0,RoundingMode.HALF_EVEN).longValueExact(); }
        catch(ArithmeticException e) { throw LedgerService.fail(400,"Converted amount is out of range"); }
        if(converted<=0 || converted>999999999999999L) throw LedgerService.fail(400,"Converted amount is outside the supported range");
        UUID id=UUID.randomUUID(); Instant expires=Instant.now().plusSeconds(120),stamp=Instant.parse(market.get("asOf").toString());
        db.update("INSERT INTO fx_quotes(id,currency,original_amount,amount,rate,provider_time,expires_at) VALUES (?,?,?,?,?,?,?)",id,currency,amount,converted,rate,java.sql.Timestamp.from(stamp),java.sql.Timestamp.from(expires));
        return Map.of("quoteId",id.toString(),"currency",currency,"originalAmountMinor",originalAmount,"settlementAmountMinor",Long.toString(converted),"rate",rate.toPlainString(),"expiresAt",expires.toString(),"asOf",stamp.toString(),"rounding","HALF_EVEN to INR paise");
    }
}
