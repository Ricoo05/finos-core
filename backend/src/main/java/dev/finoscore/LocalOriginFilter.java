package dev.finoscore;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.net.URI;
import java.util.Set;

/** Local portfolio deployment: reject cross-site browser writes and DNS rebinding hosts. */
@Component
public class LocalOriginFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
        String host=req.getServerName();
        if(!Set.of("localhost","127.0.0.1","[::1]","::1").contains(host)) { res.sendError(403,"Local access only");return; }
        String origin=req.getHeader("Origin");
        if(origin!=null) {
            try {
                URI uri=URI.create(origin);
                if(!Set.of("http://localhost:5173","http://127.0.0.1:5173","http://localhost:8080","http://127.0.0.1:8080").contains(uri.toString())) { res.sendError(403,"Untrusted origin");return; }
            } catch(Exception e) { res.sendError(403);return; }
        }
        res.setHeader("X-Content-Type-Options","nosniff");
        res.setHeader("Cache-Control","no-store");
        chain.doFilter(req,res);
    }
}
